Samsung SmartThings to HTTP+JSON Bridge
---------------------------------------
This Lambda function is a simple Samsung SmartThings "Automation"
SmartApp that submits SmartApp "Events" to a user-specified HTTP
Endpoint. It also periodically polls the inventory of Devices and
Rooms associated with a SmartThings Location.

These Events can be used as the basis for basic logging and analysis
of the activity of Devices paired with SmartThings (e.g. keeping a log
of when a door is opened or closed, etc.).

Setup
-----
(AWS)
Option 1: Manual
1. Create a Lambda function with the Node 12.x runtime.
2. Replace the entry-point with the contents of index.js.
3. Grant Samsung permission to execute your new Lambda function:
    aws lambda add-permission --statement-id smartthings \
        --principal 906037444270 \
        --action lambda:InvokeFunction \
        --function-name NAME_OF_YOUR_LAMBDA_FUNCTION

Option 2: Terraform
1. Configure a terraform backend (see main.tf.example for an example).
2. Run `terraform apply`.

(SmartThings Developer Workspace)
4. Create a new "Automation" project in the SmartThings Developer Workspace:
   https://smartthings.developer.samsung.com/workspace
5. Register your Lambda with the Automation Project by entering the
   ARN for your AWS Lambda function.
6. Do "Deploy to Test" on your Automation.

(SmartThings App)
7. Login to the SmartThings App using the same account as your Samsung
   SmartThings Developer Workspace.
8. Enable "Developer Mode" in the SmartThings App.
9. Add your new Automation to your Location.
10. Enter the URL and Bearer token to use for submitting Events.

Operation
---------
When the Automation installs, it will subscribe to events for every
Device in your Location. Subsequently, any activity on these Devices
will cause a "DEVICE_EVENT" event to be submitted to the URL you
specified when installing the Automation.

Additionally, the Automation will enumerate every Device, Location,
and Room upon installation (and on a timer every 15 minutes
thereafter). These will cause "DEVICE_INFO", "LOCATION_INFO", and
"ROOM_INFO" events to be submitted to your URL.

You can correlate these *_INFO events with the DEVICE_EVENT events
using the deviceId, locationId, and roomId attributes present in the
events.

Limitations
-----------
The SmartApps API limits Automations to a maximum of 20
subscriptions. That means this Automation may not work if you have
more than 20 Devices paired with SmartThings.
