function errorResult(err) {
    return {
        'success': false,
        'msg': err
    };
}

module.exports = errorResult;
