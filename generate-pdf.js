const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        // Open the HTML file
        const htmlFile = 'file:///' + path.join(__dirname, 'Resume Praveen Kumar.html').replace(/\\/g, '/');
        await page.goto(htmlFile, { waitUntil: 'networkidle0' });
        
        // Hide the download button explicitly just in case
        await page.addStyleTag({ content: '#download-btn { display: none !important; } .download-btn-wrapper { display: none !important; }' });

        // Generate PDF
        await page.pdf({
            path: path.join(__dirname, 'Praveen_Resume.pdf'),
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        await browser.close();
        console.log('PDF generated successfully');
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
