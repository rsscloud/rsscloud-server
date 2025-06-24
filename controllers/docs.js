const express = require('express'),
    router = new express.Router(),
    md = require('markdown-it')(),
    fs = require('fs');

router.get('/', (req, res) => {
    switch (req.accepts('html')) {
    case 'html': {
        const vals = {
            htmltext: md.render(fs.readFileSync('README.md', { encoding: 'utf8' }))
        };
        res.render('docs', vals);
        break;
    }
    default:
        res.status(406).send('Not Acceptable');
        break;
    }
});

module.exports = router;
