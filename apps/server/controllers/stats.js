const express = require('express'),
    { getStats } = require('../services/stats'),
    router = new express.Router();

router.get('/', function(req, res) {
    const stats = getStats();
    res.render('stats', stats);
});

module.exports = router;
