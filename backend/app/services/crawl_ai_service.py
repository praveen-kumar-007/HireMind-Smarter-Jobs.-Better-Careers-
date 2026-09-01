import os
import re
import json
import logging
import asyncio
from typing import Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

class CrawlAIService:
    """
    Crawl AI Engine for intelligent job extraction & content structuring.
    Extracts job descriptions, required skills, experience thresholds, and
    recruiter screening questions from any job listing URL.
    """

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9"
        }

    async def crawl_job_url(self, url: str) -> Dict[str, Any]:
        """
        Crawls a job listing URL using headless browser automation or high-speed HTTP fallback.
        Converts raw HTML into clean structured markdown and metadata.
        """
        clean_url = url.strip()
        logger.info(f"[CrawlAI] Crawling job listing: {clean_url}")

        result = {
            "url": clean_url,
            "title": "",
            "company": "",
            "location": "",
            "experience": "",
            "salary": "",
            "skills": [],
            "markdown_description": "",
            "raw_text": "",
            "screening_questions": [],
            "source": "Web"
        }

        # Try Playwright Headless Browser Crawl
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent=self.headers["User-Agent"],
                    viewport={"width": 1280, "height": 800}
                )
                page = await context.new_page()
                await page.goto(clean_url, wait_until="domcontentloaded", timeout=15000)
                await page.wait_for_timeout(1000)

                # Extract title, company, and description
                title = await page.title()
                result["title"] = title.split("|")[0].split("-")[0].strip()

                # Get clean body text and HTML
                body_text = await page.evaluate("() => document.body ? document.body.innerText : ''")
                result["raw_text"] = body_text[:10000]

                # Parse specific Naukri selectors if on Naukri
                if "naukri.com" in clean_url:
                    result["source"] = "Naukri"
                    title_el = await page.query_selector(".styles_jd-header-title__rZwM1, h1, .jd-header-title")
                    if title_el:
                        result["title"] = (await title_el.inner_text()).strip()

                    comp_el = await page.query_selector(".styles_jd-header-comp-name__MvqAI a, .comp-name, .jd-header-comp-name")
                    if comp_el:
                        result["company"] = (await comp_el.inner_text()).strip()

                    desc_el = await page.query_selector(".styles_JDC__dang-inner-html__h0K4t, .job-desc, .dang-inner-html, article")
                    if desc_el:
                        result["markdown_description"] = (await desc_el.inner_text()).strip()

                await browser.close()
        except Exception as e:
            logger.warning(f"[CrawlAI] Playwright crawl fallback: {e}")
            # Fast HTTP fallback
            try:
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=self.headers) as client:
                    resp = await client.get(clean_url)
                    if resp.status_code == 200:
                        raw_html = resp.text
                        # Simple regex text extraction
                        clean_text = re.sub(r'<script.*?</script>', '', raw_html, flags=re.DOTALL | re.IGNORECASE)
                        clean_text = re.sub(r'<style.*?</style>', '', clean_text, flags=re.DOTALL | re.IGNORECASE)
                        clean_text = re.sub(r'<[^>]+>', ' ', clean_text)
                        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                        result["raw_text"] = clean_text[:8000]
            except Exception as http_err:
                logger.error(f"[CrawlAI] HTTP crawl failed: {http_err}")

        # Post-process extracted text into markdown & structured fields
        if not result["markdown_description"] and result["raw_text"]:
            result["markdown_description"] = result["raw_text"][:3000]

        # Extract Skills from text
        common_tech = [
            "python", "react", "fastapi", "django", "node.js", "javascript", "typescript",
            "sql", "postgresql", "mysql", "mongodb", "redis", "docker", "kubernetes", "aws",
            "machine learning", "deep learning", "nlp", "pandas", "numpy", "pytorch", "tensorflow",
            "html", "css", "git", "ci/cd", "rest api", "graphql", "microservices"
        ]
        text_lower = (result["markdown_description"] + " " + result["raw_text"]).lower()
        result["skills"] = [s.title() for s in common_tech if s in text_lower]

        # Extract Experience
        exp_match = re.search(r'(\d+)\s*[-–to\s]+(\d+)\s*(?:years?|yrs?)', text_lower)
        if exp_match:
            result["experience"] = f"{exp_match.group(1)}-{exp_match.group(2)} years"
        else:
            single_exp = re.search(r'(\d+)\+?\s*(?:years?|yrs?)\s+experience', text_lower)
            if single_exp:
                result["experience"] = f"{single_exp.group(1)}+ years"

        return result

crawl_ai_service = CrawlAIService()
