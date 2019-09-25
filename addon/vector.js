class CorpusCollector extends PageVisitor {
    constructor(document) {
        super(document);

        this.trainee = undefined;
        this.traineeId = undefined;
        this.vectors = [];
    }

    formOptions() {
        const options = {};

        // Initialize options from the form.
        options.timeout = 9999;  // effectively none

        // Load each url line-by-line from the textarea.
        const prefix = this.doc.getElementById('baseUrl').value;
        options.urls = this.doc
            .getElementById('pages')
            .value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => ({filename: undefined, url: prefix + line}));

        // We need at least one url.
        if (options.urls.length === 0) {
            return undefined;
        }

        options.otherOptions = {
            wait: parseInt(this.doc.getElementById('wait').value),
            retryOnError: this.doc.getElementById('retryOnError').checked
        };

        return options;
    }

    getViewportHeightAndWidth() {
        // Pull the viewport size from the loaded trainee.
        return {
            height: this.trainee.viewportSize.height,
            width: this.trainee.viewportSize.width
        }
    }

    async processWithinTimeout(tab) {
        // Have fathom-trainees vectorize the page:
        let vector = undefined;
        let tries = 0;
        const maxTries = this.otherOptions.retryOnError ? 10 : 1;
        while (vector === undefined) {
            try {
                tries++;
                await sleep(this.otherOptions.wait * 1000);
                vector = await browser.runtime.sendMessage(
                    'fathomtrainees@mozilla.com',
                    {type: 'vectorizeTab',
                     tabId: tab.id,
                     traineeId: this.traineeId});
            } catch (error) {
                // We often get a "receiving end does not exist", even though
                // the receiver is a background script that should always be
                // registered. The error goes away on retrying.
                if (tries >= maxTries) {  // 3 is not enough.
                    this.setCurrentStatus({
                        message: 'failed: ' + error,
                        index: this.getIndexOfURL(tab.url),
                        isError: true,
                        isFinal: true
                    });
                    break;
                } else {
                    await sleep(1000);
                }
            }
        }
        if (vector !== undefined) {
            this.vectors.push(vector);

            // Check if any of the rules didn't run or returned null.
            // This presents as an undefined value in a feature vector.
            const nullFeatures = this.nullFeatures(vector.nodes);
            if (nullFeatures) {
                this.setCurrentStatus({
                    message: `failed: rule(s) ${nullFeatures} returned null values`,
                    index: this.getIndexOfURL(tab.url),
                    isError: true,
                    isFinal: true
                });
                // Stop everything (no point in continuing if we have an error)
                this.doc.dispatchEvent(new CustomEvent(
                  'fathom:done',
                  {detail: {windowId: windowId, success: false}}
                ));
            } else {
                this.setCurrentStatus({
                    message: 'vectorized',
                    index: this.getIndexOfURL(tab.url),
                    isFinal: true
                });
            }
        }
    }

    nullFeatures(nodes) {
        for (const node of nodes) {
            if (node.features.some(featureValue => featureValue === undefined)) {
                const featureNames = Array.from(this.trainee.coeffs.keys());
                return node.features.reduce((nullFeatures, featureValue, index) => {
                    if (featureValue === undefined) {
                        nullFeatures.push(featureNames[index]);
                    }
                    return nullFeatures;
                }, []);
            }
        }
    }

    async processAtBeginningOfRun() {
        this.vectors = [];
        this.traineeId = this.doc.getElementById('ruleset').value;
        this.trainee = await browser.runtime.sendMessage(
          'fathomtrainees@mozilla.com',
          {
              type: 'trainee',
              traineeId: this.traineeId
          }
        );
    }

    async processAtEndOfRun() {
        // Save vectors to disk.
        await download(JSON.stringify(
                {
                    header: {
                        version: 1,
                        featureNames: Array.from(this.trainee.coeffs.keys())
                    },
                    pages: this.vectors
                }
            ),
            {filename: 'vectors.json'}
        );
    }
}

const collector = new CorpusCollector(document);
collector.addEventListeners();

initRulesetMenu(document.getElementById('freeze'));
