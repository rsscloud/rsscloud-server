# Developer Notes

## Make sure I test pleaseNotify with multiple urls including where one url fails.

Just because one fails doesn't mean the others aren't good. The response from Dave's server is a pass or fail so I'll stick with that and show a failure even if only one fails.  This is probably an edge case.

## OPML Editor fails ping with a bad domain

```xml
<?xml version="1.0"?>
<result success="false" msg="Can&apos;t open named stream because TCP/IP error code 11001 - Host not found. (DNS error)." />
```

I should make sure I return the same response if possible.

## OPML Editor fails pleaseNotify if missing parameters

```xml
<?xml version="1.0"?>
<notifyResult success="false" msg="The following parameters were missing from the request body: notifyProcedure, port, path, protocol." />
```

