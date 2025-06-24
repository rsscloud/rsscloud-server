const getDayjs = require('./dayjs-wrapper'),
    xml2js = require('xml2js');

async function parseRpcParam(param, dayjs) {
    let returnedValue, tag, member, values;

    const value = param.value || param;

    for (tag in value) {
        switch (tag) {
        case 'i4':
        case 'int':
        case 'double':
            returnedValue = Number(value[tag]);
            break;
        case 'string':
            returnedValue = value[tag];
            break;
        case 'boolean':
            returnedValue = 'true' === value[tag] || !!Number(value[tag]);
            break;
        case 'dateTime.iso8601':
            returnedValue = dayjs.utc(value[tag], ['YYYYMMDDTHHmmss', dayjs.ISO_8601]);
            break;
        case 'base64':
            returnedValue = Buffer.from(value[tag], 'base64').toString('utf8');
            break;
        case 'struct':
            member = value[tag].member || [];
            if (!Array.isArray(member)) {
                member = [member];
            }
            returnedValue = {};
            for (const item of member) {
                returnedValue[item.name] = await parseRpcParam(item, dayjs);
            }
            break;
        case 'array':
            values = (value[tag].data || {}).value || [];
            if (!Array.isArray(values)) {
                values = [values];
            }
            returnedValue = [];
            for (const item of values) {
                returnedValue.push(await parseRpcParam(item, dayjs));
            }
            break;
        }
    }

    if (undefined === returnedValue) {
        returnedValue = value;
    }

    return returnedValue;
}

async function parseRpcRequest(req) {
    const dayjs = await getDayjs();
    const parser = new xml2js.Parser({ explicitArray: false }),
        jstruct = await parser.parseStringPromise(req.body),
        methodCall = jstruct.methodCall,
        methodName = (methodCall || {}).methodName,
        params = ((methodCall || {}).params || {}).param || [];

    if (undefined === methodCall) {
        throw new Error('Bad XML-RPC call, missing "methodCall" element.');
    }

    if (undefined === methodName) {
        throw new Error('Bad XML-RPC call, missing "methodName" element.');
    }

    const parsedParams = [];
    const paramArray = Array.isArray(params) ? params : [params];
    for (const param of paramArray) {
        parsedParams.push(await parseRpcParam(param, dayjs));
    }

    return {
        methodName,
        params: parsedParams
    };
}

module.exports = parseRpcRequest;
