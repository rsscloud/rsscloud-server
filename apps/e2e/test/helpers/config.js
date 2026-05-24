function getNumericConfig(key, defaultValue) {
    const value = process.env[key];
    return value ? parseInt(value, 10) : defaultValue;
}

module.exports = {
    ctSecsResourceExpire: getNumericConfig('CT_SECS_RESOURCE_EXPIRE', 90000),
    maxConsecutiveErrors: getNumericConfig('MAX_CONSECUTIVE_ERRORS', 3),
    feedsChangedWindowDays: getNumericConfig('FEEDS_CHANGED_WINDOW_DAYS', 7)
};
