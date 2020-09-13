# Developer Notes

## Can I test pleaseNotify without domain? Docker might not allow.

Please notify verifies a reader differently whether or not there is a domain specified. I need to make sure I test both cases.

## Make sure I test pleaseNotify with multiple urls including where one url fails.

Just because one fails doesn't mean the others aren't good. The response from Dave's server is a pass or fail so I'll stick with that and show a failure even if only one fails.  This is probably an edge case.

## If I ping Dave's server with a bad domain I get the following error:

```xml
<?xml version="1.0"?>
<result success="false" msg="Can&apos;t open named stream because TCP/IP error code 11001 - Host not found. (DNS error)." />
```

I should make sure I return the same response if possible.

## Is there a way to create mock a server with https in docker?

I'm adding https-post as an option and would like to make sure to test it.
