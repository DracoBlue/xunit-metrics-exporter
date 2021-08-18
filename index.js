require('dotenv').config();
const debug = require('debug')('xunit-metrics-exporter');
const glob = require("glob");
const express = require('express');
const util = require('util');
const fs = require('fs');
const xml2js = require('xml2js');
const app = express();

/* As specified at https://github.com/prometheus/docs/blob/master/content/docs/instrumenting/exposition_formats.md#comments-help-text-and-type-information */
let escapeHelpLabel = (rawLabel) => {
    var metricHelpEscapeMap = {
        '\n': '\\n',
        '\\': '\\\\',
    };

    return ("" + rawLabel).replace(/([\\\n])/g, (str, item) => {
        return metricHelpEscapeMap[item];
    });
};

/* As specified at https://github.com/prometheus/docs/blob/master/content/docs/instrumenting/exposition_formats.md#comments-help-text-and-type-information */
let quoteMetricLabel = (rawLabel) => {
    var metricLabelEscapeMap = {
        '\n': '\\n',
        '\\': '\\\\',
        '"': '\\"',
    };

    return "\"" + ("" + rawLabel).replace(/([\\\n"])/g, (str, item) => {
        return metricLabelEscapeMap[item];
    }) + "\"";
};


let getSuites = async () => {
    let suites = [];

    let rules = JSON.parse(await util.promisify(fs.readFile)(process.env.RULES_FILE_PATH || './rules.json'));

    await Promise.all(rules.map(async (rule) => {

        const paths = await util.promisify(glob)(rule.glob);

        let testResultSuites = [];

        await Promise.all(paths.map(async (path) => {
            const xmlContent = await util.promisify(fs.readFile)(path);
            testResultSuites.push(await xml2js.parseStringPromise(xmlContent));
        }));

        testResultSuites.forEach((testResultSuite) => {

            if (testResultSuite.testsuites.testsuite) {
                let rawTestSuites = Array.isArray(testResultSuite.testsuites.testsuite) ? testResultSuite.testsuites.testsuite : [testResultSuite.testsuites.testsuite];

                let defaultFilePath = '';

                rawTestSuites.forEach((rawTestSuite) => {
                    let suite = {
                        name: rawTestSuite['$'].name,
                        timestamp: rawTestSuite['$'].timestamp,
                        failedCount: parseInt(rawTestSuite['$'].failures, 10),
                        testsCount: parseInt(rawTestSuite['$'].tests, 10),
                        skippedCount: 0,
                        duration: parseFloat(rawTestSuite['$'].time),
                    };

                    if (rawTestSuite['$'].file) {
                        suite.filePath = rawTestSuite['$'].file;

                        if (rule.filePathReplacers) {
                            rule.filePathReplacers.forEach((filePathReplacer) => {
                                suite.filePath = suite.filePath.replace(filePathReplacer[0], filePathReplacer[1]);
                            })
                        }

                        if (suite.name === 'Root Suite') {
                            defaultFilePath = suite.filePath;
                        }
                    } else {
                        if (defaultFilePath) {
                            suite.filePath = defaultFilePath;
                        }
                    }

                    if (suite.filePath) {
                        suite.fileName = require('path').basename(suite.filePath);
                        suite.folderName = require('path').dirname(suite.filePath);
                    }

                    suite.successfulCount = suite.testsCount - suite.failedCount;
                    //
                    // if (rawTestSuite.testcase) {
                    //     let rawTestCases = Array.isArray(rawTestSuite.testcase) ? rawTestSuite.testcase : [rawTestSuite.testcase];
                    //     rawTestCases.forEach((rawTestCase) => {
                    //         let testcase = {
                    //             name: rawTestCase['$'].name,
                    //             time: parseFloat(rawTestCase['$'].time),
                    //             classname: rawTestCase['$'].classname,
                    //             failures: (rawTestCase.failure || []).length,
                    //             rawTestCase
                    //         }
                    //     })
                    // }

                    if (suite.testsCount) {
                        suites.push(suite);
                    }
                })
            }
        });

    }));

    return suites;
}

let getMetrics = async () => {
    let suites = await getSuites();

    let lines = [];

    let resultName = "xunit_suite";
    let durationName = "xunit_duration_seconds";
    let type = "gauge";


    let failedCount = 0;
    let successfulCount = 0;
    let skippedCount = 0;
    let durationSecondsTotal = 0;

    lines.push('# HELP ' + resultName + ' xunit result');
    lines.push('# TYPE ' + resultName + ' ' + type.toLowerCase());
    lines.push('# HELP ' + durationName + ' xunit duration');
    lines.push('# TYPE ' + durationName + ' ' + type.toLowerCase());


    suites.forEach((suite) => {

        debug('result', suite);

        durationSecondsTotal += suite.duration;

        successfulCount += suite.successfulCount;
        failedCount += suite.failedCount;
        skippedCount += suite.skippedCount;

        let labels = {
            "name": suite.name,
            "file_name": suite.fileName,
            "folder_name": suite.folderName,
            "result": suite.failedCount === 0 && suite.skippedCount === 0 ?  "success" : (suite.failedCount > 0 ? "failure" : "skipped")
        };

        let resultId = labels.result === "success" ? 0 : (labels.result === "failure" ? 1 : 2);

        if (suite.title) {
            labels.title = suite.title;
        }

        let labelsSuffixParts = [];
        Object.keys(labels).forEach((labelKey) => {
            labelsSuffixParts.push([labelKey, '=', quoteMetricLabel(labels[labelKey])].join(''));
        });

        if (labelsSuffixParts.length > 0) {
            lines.push(resultName + '{' + labelsSuffixParts.join(",") + '} ' + resultId);
        } else {
            lines.push(resultName + ' ' + resultId);
        }

        if (labelsSuffixParts.length > 0) {
            lines.push(durationName + '{' + labelsSuffixParts.join(",") + '} ' + suite.duration);
        } else {
            lines.push(durationName + ' ' + suite.duration);
        }
    });

    lines.push('# HELP xunit_failed_total xunit failed tests');
    lines.push('# TYPE xunit_failed_total gauge');
    lines.push('xunit_failed_total ' + failedCount);
    lines.push('# HELP xunit_successful_total xunit successful tests');
    lines.push('# TYPE xunit_successful_total gauge');
    lines.push('xunit_successful_total ' + successfulCount);
    lines.push('# HELP xunit_skipped_total xunit skipped tests');
    lines.push('# TYPE xunit_skipped_total gauge');
    lines.push('xunit_skipped_total ' + skippedCount);
    lines.push('# HELP xunit_duration_seconds_total xunit total duration');
    lines.push('# TYPE xunit_duration_seconds_total gauge');
    lines.push('xunit_duration_seconds_total ' + durationSecondsTotal);

    return lines;
};

app.get('/', function (req, res) {
    res.set('X-App-Version', process.env.APP_VERSION || 'dev')
    res.send('OK');
});

app.get('/metrics', function (req, res) {
    res.set('X-App-Version', process.env.APP_VERSION || 'dev')
    getMetrics().then((lines) => {
        res.setHeader('Content-Type', 'text/plain');
        res.send(lines.join("\n"));
    });
});


app.listen(process.env.PORT || 9442, '0.0.0.0', function () {
});

