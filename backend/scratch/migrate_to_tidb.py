import ssl
import pymysql
from sqlalchemy import create_engine, MetaData, Table, text
from sqlalchemy.orm import sessionmaker

# Local MySQL credentials
LOCAL_CONFIG = {
    "host": "127.0.0.1",
    "user": "root",
    "password": "Praveen@2001",
    "port": 3306,
    "database": "job_assistant"
}

# TiDB Cloud credentials
TIDB_CONFIG = {
    "host": "gateway01.us-east-1.prod.aws.tidbcloud.com",
    "user": "3JiS1L8sNaw3EyD.root",
    "password": "F7gcMsjEtHHKVn9C",
    "port": 4000,
    "database": "job_assistant"
}

def migrate():
    ctx = ssl.create_default_context()
    
    print("1. Connecting to local MySQL...")
    local_conn = pymysql.connect(**LOCAL_CONFIG, cursorclass=pymysql.cursors.DictCursor)
    local_cur = local_conn.cursor()
    
    print("2. Connecting to TiDB Cloud...")
    # Ensure database exists
    init_conn = pymysql.connect(
        host=TIDB_CONFIG["host"],
        user=TIDB_CONFIG["user"],
        password=TIDB_CONFIG["password"],
        port=TIDB_CONFIG["port"],
        ssl=ctx
    )
    init_cur = init_conn.cursor()
    init_cur.execute(f"CREATE DATABASE IF NOT EXISTS `{TIDB_CONFIG['database']}`;")
    init_conn.commit()
    init_conn.close()
    
    tidb_conn = pymysql.connect(**TIDB_CONFIG, ssl=ctx, cursorclass=pymysql.cursors.DictCursor)
    tidb_cur = tidb_conn.cursor()
    
    print("3. Fetching tables from local database...")
    local_cur.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE';")
    tables = [list(row.values())[0] for row in local_cur.fetchall()]
    print(f"Found {len(tables)} tables: {tables}")
    
    # Disable foreign key checks on TiDB during migration
    tidb_cur.execute("SET FOREIGN_KEY_CHECKS = 0;")
    
    for table_name in tables:
        print(f"\n--- Migrating table: {table_name} ---")
        
        # Get CREATE TABLE DDL from local
        local_cur.execute(f"SHOW CREATE TABLE `{table_name}`;")
        create_info = local_cur.fetchone()
        create_sql = create_info["Create Table"]
        
        # Drop and recreate table on TiDB
        tidb_cur.execute(f"DROP TABLE IF EXISTS `{table_name}`;")
        tidb_cur.execute(create_sql)
        print(f"  [+] Created table `{table_name}` on TiDB")
        
        # Fetch all rows from local table
        local_cur.execute(f"SELECT * FROM `{table_name}`;")
        rows = local_cur.fetchall()
        
        if rows:
            columns = list(rows[0].keys())
            cols_str = ", ".join([f"`{c}`" for c in columns])
            placeholders = ", ".join(["%s"] * len(columns))
            insert_sql = f"INSERT INTO `{table_name}` ({cols_str}) VALUES ({placeholders});"
            
            data_values = []
            for row in rows:
                data_values.append([row[col] for col in columns])
                
            # Batch insert in chunks of 500
            chunk_size = 500
            for i in range(0, len(data_values), chunk_size):
                chunk = data_values[i:i + chunk_size]
                tidb_cur.executemany(insert_sql, chunk)
            
            tidb_conn.commit()
            print(f"  [+] Inserted {len(rows)} rows into `{table_name}`")
        else:
            print(f"  [-] 0 rows to insert for `{table_name}`")
            
    tidb_cur.execute("SET FOREIGN_KEY_CHECKS = 1;")
    tidb_conn.commit()
    
    print("\n==========================================")
    print("4. Verification / Comparison:")
    print("==========================================")
    all_matched = True
    for table_name in tables:
        local_cur.execute(f"SELECT COUNT(*) as cnt FROM `{table_name}`;")
        l_cnt = local_cur.fetchone()["cnt"]
        
        tidb_cur.execute(f"SELECT COUNT(*) as cnt FROM `{table_name}`;")
        t_cnt = tidb_cur.fetchone()["cnt"]
        
        status = "MATCH" if l_cnt == t_cnt else "MISMATCH"
        if status != "MATCH":
            all_matched = False
        print(f" - {table_name:28} | Local: {l_cnt:5} | TiDB: {t_cnt:5} | [{status}]")
        
    local_conn.close()
    tidb_conn.close()
    
    if all_matched:
        print("\n>>> ALL TABLES AND DATA SUCCESSFULLY MIGRATED TO TIDB CLOUD! <<<")
    else:
        print("\n>>> WARNING: Some table row counts did not match. <<<")

if __name__ == "__main__":
    migrate()
