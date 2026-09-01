import logging
from sqlalchemy.orm import Session
from app.db.session import engine, Base
from app.models.user import User, Profile
from app.models.resume import Resume
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def init_db(db: Session) -> None:
    # Create all tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # Check for primary user praveen.pr105@gmail.com
    primary_email = "praveen.pr105@gmail.com"
    
    # Migrate any old admin user if present
    old_admin = db.query(User).filter(User.email == "admin@example.com").first()
    if old_admin:
        old_admin.email = primary_email
        db.commit()
        db.refresh(old_admin)
    
    user = db.query(User).filter(User.email == primary_email).first()
    if not user:
        hashed_password = pwd_context.hash("admin123")
        user = User(
            email=primary_email,
            hashed_password=hashed_password,
            role="user",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create fresh profile
        profile = Profile(
            user_id=user.id,
            full_name="Praveen Kumar",
            phone="+91 9504904499",
            location="Dhanbad, India",
            experience_level="junior", # Fresher / Entry Level
            target_roles=["Software Engineer (Fresher)", "Full Stack Developer", "Python Developer", "AI/ML Engineer"],
            preferred_locations=["Bengaluru", "Hyderabad", "Pune", "Remote", "Dhanbad"],
            remote_preference="any",
            work_authorization="authorized",
            notice_period="immediate",
            salary_expectation="₹6.0 - ₹12.0 LPA",
            test_mode=True,
            max_applications_per_day=20,
            github="https://github.com/praveen-kumar-007",
            linkedin="https://www.linkedin.com/in/praveen105"
        )
        db.add(profile)
        db.commit()

    # Seed using Resume Praveen Kumar.html for primary user
    user = db.query(User).filter(User.email == primary_email).first()
    if user:
        resume_loaded = db.query(Resume).filter(Resume.user_id == user.id).first()
        if not resume_loaded:
            import os
            from app.services.resume_service import resume_service
            
            # Paths relative to backend or root folder
            html_path = "../Resume Praveen Kumar.html"
            if not os.path.exists(html_path):
                html_path = "Resume Praveen Kumar.html"
                
            if os.path.exists(html_path):
                try:
                    # Clean, pre-parsed structured content matching the HTML file exactly
                    parsed_data = {
                        "name": "Praveen Kumar",
                        "email": "praveen.pr105@gmail.com",
                        "phone": "+91 9504904499",
                        "location": "Dhanbad, India",
                        "linkedin": "https://www.linkedin.com/in/praveen105",
                        "github": "https://github.com/praveen-kumar-007",
                        "skills": [
                            "Python", "Pandas", "NumPy", "Scikit-learn", "TensorFlow", "Keras", "OpenCV", 
                            "Machine Learning", "Deep Learning", "Data Analysis", "Data Visualization", 
                            "CNN", "Image Classification", "React JS", "Node JS", "HTML", "CSS", 
                            "JavaScript", "SQL", "Database Management", "Google Cloud", "Git", "GitHub", "Problem-Solving"
                        ],
                        "experience": [
                            {
                                "company": "Multimarg Private Limited",
                                "title": "Full Stack Developer (Freelance)",
                                "location": "Remote",
                                "start_date": "Jun 2026",
                                "end_date": "Aug 2026",
                                "description": "Architected and developed a comprehensive full-stack logistics platform, designing robust RESTful APIs to handle complex booking, billing, and carrier coordination workflows. Engineered a secure Role-Based Access Control (RBAC) architecture using JWT authentication, enforcing strict data isolation and governance across admin, finance, and logistics modules. Optimized application performance and database schemas, ensuring scalable and seamless data flow for enterprise operations."
                            },
                            {
                                "company": "IIT ISM Dhanbad",
                                "title": "AI/ML Intern",
                                "location": "Dhanbad, India",
                                "start_date": "Dec 2025",
                                "end_date": "Jan 2026",
                                "description": "Researched methane gas detection in coal mining environments using sequence models and hybrid CNN-LSTM architectures. Designed and compared LSTM, GRU, Bidirectional LSTM, and CNN-LSTM models for methane detection. Implemented sensor preprocessing pipelines and handled noisy time-series data for early warning signals."
                            },
                            {
                                "company": "IIT BHU",
                                "title": "AI/ML Intern",
                                "location": "Varanasi, India",
                                "start_date": "Jun 2025",
                                "end_date": "Jul 2025",
                                "description": "Developed a machine learning model for predicting energy consumption in smart buildings. Worked under the mentorship of Dr. Vinayak Srivastava, focusing on sustainable tech solutions. Applied advanced data handling and preprocessing techniques for performance analysis."
                            },
                            {
                                "company": "AICTE, Shell & Edunet Foundation",
                                "title": "AI and Data Analytics Intern",
                                "location": "Virtual",
                                "start_date": "Jul 2025",
                                "end_date": "Aug 2025",
                                "description": "Completed the Skills4Future Program focused on AI, Data Analytics, and Green Skills. Gained hands-on experience with data-driven techniques and applied analytics to sustainability-related challenges."
                            },
                            {
                                "company": "Encryptix",
                                "title": "Machine Learning Intern",
                                "location": "Remote",
                                "start_date": "Aug 2024",
                                "end_date": "Sep 2024",
                                "description": "Gained hands-on experience in applying machine learning concepts from development to deployment. Contributed to team projects, demonstrating strong analytical and problem-solving skills."
                            }
                        ],
                        "education": [
                            {
                                "institution": "Swami Vivekananda University",
                                "degree": "Bachelor of Technology",
                                "field_of_study": "Computer Science",
                                "start_date": "2022",
                                "end_date": "2026",
                                "gpa": "8.5 CGPA"
                            },
                            {
                                "institution": "JLSM DAV College Bhaga",
                                "degree": "Intermediate",
                                "field_of_study": "Science",
                                "start_date": "2020",
                                "end_date": "2022",
                                "gpa": "79%"
                            },
                            {
                                "institution": "Rajkamal Saraswati Vidya Mandir",
                                "degree": "Matriculation",
                                "field_of_study": "General",
                                "start_date": "2018",
                                "end_date": "2020",
                                "gpa": "78%"
                            }
                        ],
                        "projects": [
                            {
                                "title": "Multimarg Logistics Platform",
                                "description": "Built a scalable B2B logistics application, focusing on modular component design, responsive UI/UX, and robust backend architecture. Implemented secure Identity and Access Management (IAM) with token-based authentication to manage granular permissions across varying operational roles. Developed dynamic administrative dashboards utilizing advanced state management for efficient data visualization and centralized service tracking.",
                                "technologies": ["React", "Node.js", "Express.js", "MongoDB", "RESTful APIs", "JWT"]
                            },
                            {
                                "title": "Methane Detection in Coal Mining",
                                "description": "Developed a system for gas detection and early warning during an internship at IIT (ISM) Dhanbad. Utilized sequence models (LSTM, GRU, Bi-LSTM) and CNN-LSTM for anomaly detection in sensor data.",
                                "technologies": ["Python", "TensorFlow", "Keras", "Pandas"]
                            },
                            {
                                "title": "Brain Tumor Detection Model",
                                "description": "Developed a CNN-based model to classify MRI brain scans for tumor detection with high accuracy. Involved image preprocessing, custom CNN architecture design, and model evaluation.",
                                "technologies": ["Python", "TensorFlow", "Keras", "OpenCV"]
                            },
                            {
                                "title": "Energy Consumption Prediction",
                                "description": "Built an ML model to predict energy usage in residential smart buildings during an IIT BHU internship. Involved time-series analysis, feature engineering, and regression model comparison.",
                                "technologies": ["Python", "Scikit-learn", "Pandas"]
                            },
                            {
                                "title": "SP Kabaddi - Club Website",
                                "description": "Built the production website for SP Kabaddi Group, featuring news, player registration, and an admin dashboard. Implemented an in-built player ID card generation feature and Cloudinary integration.",
                                "technologies": ["React", "JSS", "Vite", "Node.js", "MongoDB"]
                            },
                            {
                                "title": "Dhanbad District Kabaddi Association Website",
                                "description": "Developed the official governing body website for kabaddi in Dhanbad. Features super-admin/admin roles, content management, registration workflows, and ID card generation.",
                                "technologies": ["React", "JSS", "Vite", "Node.js", "MongoDB"]
                            }
                        ]
                    }
                    
                    # Force populate user profile details
                    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
                    if profile:
                        profile.full_name = parsed_data["name"]
                        profile.phone = parsed_data["phone"]
                        profile.location = parsed_data["location"]
                        profile.experience_level = "junior" # Fresher
                        profile.target_roles = ["Software Engineer (Fresher)", "Full Stack Developer", "Python Developer", "AI/ML Engineer"]
                        profile.preferred_locations = ["Bengaluru", "Hyderabad", "Pune", "Remote", "Dhanbad"]
                        db.commit()
                        
                    resume_service.save_parsed_resume(db, user.id, html_path, parsed_data)
                    logging.getLogger(__name__).info("Seeded Resume Praveen Kumar.html successfully for praveen.pr105@gmail.com on startup.")
                except Exception as e:
                    logging.getLogger(__name__).error(f"Failed to auto-seed Resume Praveen Kumar.html: {e}")

