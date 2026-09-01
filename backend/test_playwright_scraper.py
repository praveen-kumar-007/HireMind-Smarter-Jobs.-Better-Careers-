from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
    url = "https://www.naukri.com/python-developer-jobs-in-india?sort=dd"
    print(f"Navigating to: {url}")
    page.goto(url, wait_until="domcontentloaded", timeout=20000)
    page.wait_for_timeout(3000)
    
    tuples = page.locator("article, .cust-job-tuple, .srp-jobtuple-wrapper, .jobTuple").all()
    print(f"Found {len(tuples)} job cards on live page:")
    for t in tuples[:8]:
        try:
            title_el = t.locator("a.title, a.job-title, [class*='title'] a").first
            comp_el = t.locator("a.comp-name, .comp-name, .subTitle").first
            loc_el = t.locator("span.loc-wrap, span.loc, span[class*='loc']").first
            if title_el.count() > 0:
                print(f"- [{comp_el.inner_text().strip() if comp_el.count() > 0 else 'Unknown'}] {title_el.inner_text().strip()} -> {title_el.get_attribute('href')}")
        except Exception as ex:
            print("Error parsing card:", ex)
    browser.close()
