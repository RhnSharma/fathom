const {assert} = require('chai');
const firefox = require('selenium-webdriver/firefox');
const webdriver = require('selenium-webdriver');
const {ancestors, isDomElement, isVisible, toDomElement} = require('../../utilsForFrontend'); // eslint-disable-line node/no-missing-require

const {Builder, until, By} = webdriver;

const WAIT_MS = 10000;
const TEST_PAGE_URL = 'http://localhost:8000/isVisible.html';

describe('isVisible', () => {
    const options = new firefox.Options();
    options.headless();

    const driver = new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();

    async function checkVisibility(id, expected) {
        await driver.wait(until.elementLocated(By.id(id)), WAIT_MS);
        const isElementVisible = await driver.executeScript(`
            ${ancestors}
            ${isDomElement}
            ${toDomElement}
            return ${isVisible}(document.getElementById('${id}'));
        `);
        assert.equal(
            isElementVisible,
            expected,
            `isVisible should return false for element with id '${id}'.`
        );
    }

    it('should return false when an element is hidden', async function () {
        this.timeout(WAIT_MS);
        const hiddenElementIds = await driver.executeScript(`
            return [].slice.call(document.querySelectorAll('[id^="not-visible-"]')).map((element) => element.id);
        `);

        await driver.get(TEST_PAGE_URL);

        for (const id of hiddenElementIds) {
            await checkVisibility(id, false);

        }
    });

    it('should return true when an element is visible', async function () {
        this.timeout(WAIT_MS);
        const visibleElementIds = await driver.executeScript(`
            return [].slice.call(document.querySelectorAll('[id^="visible-"]')).map((element) => element.id);
        `);
        await driver.get(TEST_PAGE_URL);

        for (const id of visibleElementIds) {
            await checkVisibility(id, true);
        }
    });

    after(async function () {
        this.timeout(WAIT_MS);
        return driver.quit();
    });
});
