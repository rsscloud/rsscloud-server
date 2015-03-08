rssCloud Server
---------------

rssCloud Server implementation in Node.js

## How to install

```bash
git clone https://github.com/andrewshell/rsscloud-server.git
cd rsscloud-server
npm install
npm start
```

## How to use

### POST /pleaseNotify

Posting to /pleaseNotify is your way of alerting the server that you want to receive notificaions when one or more resources are updated. 

The POST parameters are:

1. domain -- optional, if omitted the requesting IP address is used
2. port
3. path
4. registerProcedure -- required, but isn't used in this server as it only applies to xml-rpc or soap
5. protocol -- the spec allows for http-post, xml-rpc or soap but this server only supports http-post
6. url1, url2, ..., urlN this is the resource you're requesting to be notified about.  In the case of an RSS feed you would specify the URL of the RSS feed.

When you POST the server first checks if the urls you specifed are returning an [HTTP 2xx status code](http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.2) then it attempts to notify the subscriber of an update to make sure it works.  This is done in one of two ways.

1. If you did not specify a domain parameter and we're using the requesting IP address we perform a POST request to the URL represented by `http://<ip>:<port><path>` with a single parameter `url`. To accept the subscription that resource just needs to return an HTTP 2xx status code.
2. If you did specify a domain parameter then we perform a GET request to the URL represented by `http://<domain>:<port><path>` with two query string parameters, url and challenge. To accept the subscription that resource needs to return an HTTP 2xx status code and have the challenge value as the response body.

You will receive a response with two values:

1. success -- true or false depending on whether or not the subscription suceeded
2. msg -- a string that explains either that you succeed or why it failed

The default response type is text/xml but if you POST with an [accept header](http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.1) specifying `application/json` we will return a JSON formatted response.

Examples:

```xml
<?xml version="1.0"?>
<notifyResult success="false" msg="The subscription was cancelled because the call failed when we tested the handler."/>
```

```json
{"success":false,"msg":"The subscription was cancelled because the call failed when we tested the handler."}
```

### /ping

### /pingForm

### /viewLog
