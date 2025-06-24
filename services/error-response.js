function ErrorResponse(message) {
    this.message = message;
}

ErrorResponse.prototype = Object.create(Error.prototype);
ErrorResponse.prototype.constructor = ErrorResponse;
ErrorResponse.prototype.name = 'ErrorResponse';

module.exports = ErrorResponse;
