const express = require('express'),
    router = new express.Router();

router.get('/', function(req, res) {
    const wsProtocol = req.protocol === 'https' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${req.get('host')}/wsLog`;
    res.render('view-log', {
        wsUrl
    });
});

module.exports = router;
