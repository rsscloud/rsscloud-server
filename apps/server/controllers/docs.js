const express = require('express'),
    router = new express.Router(),
    md = require('markdown-it')(),
    fs = require('fs');

router.get('/', (req, res) => {
    switch (req.accepts('html')) {
        case 'html': {
            try {
                // README keeps its own "# rssCloud Server" heading for GitHub,
                // but the docs page uses a consistent "Documentation" header,
                // so drop the leading H1 from the rendered output.
                const htmltext = md
                    .render(fs.readFileSync('README.md', { encoding: 'utf8' }))
                    .replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '');
                res.render('docs', {
                    title: 'rssCloud Server: Documentation',
                    heading: 'rssCloud Server: Documentation',
                    htmltext
                });
            } catch (err) {
                console.error('Error reading README.md:', err.message);
                res.status(500).send('Internal Server Error');
            }
            break;
        }
        default:
            res.status(406).send('Not Acceptable');
            break;
    }
});

module.exports = router;
