# rssCloud Server

[![MIT License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](https://github.com/facebook/react/blob/master/LICENSE)
[![rssCloud Server 2.x](https://circleci.com/gh/andrewshell/rsscloud-server/tree/2.x.svg?style=shield)](https://circleci.com/gh/andrewshell/rsscloud-server/tree/2.x)
[![Andrew Shell's Weblog](https://img.shields.io/badge/weblog-rssCloud-brightgreen)](https://blog.andrewshell.org/search/?keywords=rsscloud)

rssCloud Server implementation in Node.js

## How to install

```bash
git clone https://github.com/andrewshell/rsscloud-server.git
cd rsscloud-server
npm install
npm start
```

## How to test

The API is tested using docker containers. I've only tested on MacOS so if you have experience testing on other platforms I'd love having these notes updated for those platforms.

### MacOS

First install [Docker Desktop for Mac](https://hub.docker.com/editions/community/docker-ce-desktop-mac)

```bash
npm run test-api
```

This should build the appropriate containers and show the test output.

Our tests create mock API endpoints so we can verify rssCloud server works correctly when reading resources and notifying subscribers.

## How to use

### POST /pleaseNotify

Posting to /pleaseNotify is your way of alerting the server that you want to receive notifications when one or more resources are updated.

The POST parameters are:

1. domain -- optional, if omitted the requesting IP address is used
2. port
3. path
4. registerProcedure -- required, but isn't used in this server as it only applies to xml-rpc or soap.
5. protocol -- the spec allows for http-post, xml-rpc or soap but this server only supports http-post. This server also supports https-post which is identical to http-post except it notifies using https as the scheme instead of http.
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

### POST /ping

Posting to /ping is your way of alerting the server that a resource has been updated.

The POST parameters are:

1. url

When you POST the server first checks if the url has actually changed since the last time it checked.  If it has, it will go through it's list of subscribers and POST to the subscriber with the parameter `url`.

The default response type is text/xml but if you POST with an [accept header](http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.1) specifying `application/json` we will return a JSON formatted response.

Examples:

```xml
<?xml version="1.0"?>
<result success="true" msg="Thanks for the ping."/>
```

```json
{"success":true,"msg":"Thanks for the ping."}
```

### GET /pingForm

The path /pingForm is an HTML form intented to allow you to ping via a web browser.

### GET /viewLog

The path /viewLog is a log of recent events that have occured on the server. It's very useful if you're trying to debug your tools.
