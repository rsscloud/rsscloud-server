let dayjs;

async function getDayjs() {
    if (!dayjs) {
        const dayjsModule = await import('dayjs');
        const utc = await import('dayjs/plugin/utc.js');
        const advancedFormat = await import('dayjs/plugin/advancedFormat.js');
        const duration = await import('dayjs/plugin/duration.js');
        const customParseFormat = await import('dayjs/plugin/customParseFormat.js');

        dayjs = dayjsModule.default;
        dayjs.extend(utc.default);
        dayjs.extend(advancedFormat.default);
        dayjs.extend(duration.default);
        dayjs.extend(customParseFormat.default);
    }
    return dayjs;
}

module.exports = getDayjs;
