const express = require('express'),
    router = new express.Router();

router.get('/', function(req, res) {
    res.render('view-log', {
        host: req.app.locals.host,
        port: req.app.locals.port
    });
});

module.exports = router;
