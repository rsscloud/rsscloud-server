function ErrorResponse(message, code) {
    this.message = message;
    this.code = code;
}

ErrorResponse.prototype = Object.create(Error.prototype);
ErrorResponse.prototype.constructor = ErrorResponse;
ErrorResponse.prototype.name = 'ErrorResponse';

module.exports = ErrorResponse;
