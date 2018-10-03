(function () {
    "use strict";

    var express = require('express'),
        router = express.Router();

    router.get('/', function (req, res) {
        switch (req.accepts('html')) {
            case 'html':
                res.render('home');
                break;
            default:
                res.status(406).send('Not Acceptable');
                break;
        }
    });

    module.exports = router;
}());
