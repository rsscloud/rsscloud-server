const express = require('express'),
    { createStats } = require('../services/stats'),
    { core } = require('../core'),
    { getStats } = createStats({ core }),
    router = new express.Router();

router.get('/', function(req, res) {
    const stats = getStats();
    res.render('stats', stats);
});

module.exports = router;
