# xunit-metrics-exporter

This project is capable of returning prometheus metrics for all xunit xml files in specific folders.

## Usage

To make xunit-metrics-exporter work, you will need a file located at ./rules.json or at any path set by the
environment variables set: `RULES_FILE_PATH`.

The `rules.json`:

```json
[
  {
    "glob": "./results/*.xml",
    "filePathReplacers": [["cypress/integration/", ""]]
  }
]

```

## Example Output

If you want to use docker-compose.yml to try it, use:

```yaml
version: "2.0"
services:
  xunit-metrics-exporter:
    image: dracoblue/xunit-metrics-exporter
    environment:
      - "RULES_FILE_PATH=/usr/src/app/rules.json"
    volumes:
      - ./results:/usr/src/app/results
      - ./rules.json:/usr/src/app/rules.json
    ports:
      - "9442:9442"
```

and put a `results/test.xml` with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Mocha Tests" time="1.6930" tests="6" failures="1">
  <testsuite name="Root Suite" timestamp="2021-08-18T11:06:04" tests="0" file="cypress/integration/1-getting-started/todo.spec.js" time="0.0000" failures="0">
  </testsuite>
  <testsuite name="example to-do app" timestamp="2021-08-18T11:06:04" tests="3" time="0.7480" failures="1">
    <testcase name="example to-do app displays two todo items by default" time="0.0000" classname="displays two todo items by default">
      <failure message="Timed out retrying after 4000ms: expected &apos;&lt;li&gt;&apos; to have text &apos;Walk the dog2&apos;, but the text was &apos;Walk the dog&apos;" type="AssertionError"><![CDATA[AssertionError: Timed out retrying after 4000ms: expected '<li>' to have text 'Walk the dog2', but the text was 'Walk the dog'
    at Context.eval (https://example.cypress.io/__cypress/tests?p=cypress/integration/1-getting-started/todo.spec.js:128:36)]]></failure>
    </testcase>
    <testcase name="example to-do app can add new todo items" time="0.4830" classname="can add new todo items">
    </testcase>
    <testcase name="example to-do app can check off an item as completed" time="0.2650" classname="can check off an item as completed">
    </testcase>
  </testsuite>
  <testsuite name="with a checked task" timestamp="2021-08-18T11:06:12" tests="3" time="0.9450" failures="0">
    <testcase name="example to-do app with a checked task can filter for uncompleted tasks" time="0.3060" classname="can filter for uncompleted tasks">
    </testcase>
    <testcase name="example to-do app with a checked task can filter for completed tasks" time="0.3420" classname="can filter for completed tasks">
    </testcase>
    <testcase name="example to-do app with a checked task can delete all completed tasks" time="0.2970" classname="can delete all completed tasks">
    </testcase>
  </testsuite>
</testsuites>
```
and put your `rules.json` in the very same directory with the contents:

```json
[
  {
    "glob": "/usr/src/app/results/*.xml",
    "filePathReplacers": [["cypress/integration/", ""]]
  }
]
```

Then the prometheus metrics are available at <http://localhost:9442> and your metrics will look like this:

```text
# HELP xunit_suite xunit result
# TYPE xunit_suite gauge
# HELP xunit_duration_seconds xunit duration
# TYPE xunit_duration_seconds gauge
xunit_suite{name="example to-do app",file_name="todo.spec.js",folder_name="1-getting-started",result="failure"} 1
xunit_duration_seconds{name="example to-do app",file_name="todo.spec.js",folder_name="1-getting-started",result="failure"} 0.748
xunit_suite{name="with a checked task",file_name="todo.spec.js",folder_name="1-getting-started",result="success"} 0
xunit_duration_seconds{name="with a checked task",file_name="todo.spec.js",folder_name="1-getting-started",result="success"} 0.945
# HELP xunit_failed_total xunit failed tests
# TYPE xunit_failed_total gauge
xunit_failed_total 1
# HELP xunit_successful_total xunit successful tests
# TYPE xunit_successful_total gauge
xunit_successful_total 5
# HELP xunit_skipped_total xunit skipped tests
# TYPE xunit_skipped_total gauge
xunit_skipped_total 0
# HELP xunit_duration_seconds_total xunit total duration
# TYPE xunit_duration_seconds_total gauge
xunit_duration_seconds_total 1.693
```

## License

This work is copyright by DracoBlue (http://dracoblue.net) and licensed under the terms of MIT License.
