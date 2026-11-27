import { THEMES, applyTheme, loadTheme } from './theme-b3c8dcd35596.js';
import { THEME_MACHINES } from './theme-machines-21edc06313a6.js';
export function initThemeUi(doc = document) {
    let activeTheme = loadTheme();
    const themeSelects = Array.from(doc.querySelectorAll('.theme-select'));
    const themeAboutDialog = doc.querySelector('#theme-about-dialog');
    const themeAboutHeading = doc.querySelector('#theme-about-heading');
    const themeAboutEra = doc.querySelector('#theme-about-era');
    const themeAboutImage = doc.querySelector('#theme-about-image');
    const themeAboutImageFallback = doc.querySelector('#theme-about-image-fallback');
    const themeAboutFacts = doc.querySelector('#theme-about-facts');
    const themeAboutImageCredit = doc.querySelector('#theme-about-image-credit');
    const themeAboutImageLicense = doc.querySelector('#theme-about-image-license');
    const themeAboutHistorySource = doc.querySelector('#theme-about-history-source');
    const themeAboutClose = doc.querySelector('#theme-about-close');
    const listeners = new AbortController();
    function focusSelector() {
        const selector = themeSelects.find((select) => select.closest('[hidden]') === null && select.getClientRects().length > 0);
        selector?.focus();
    }
    function setTheme(id) {
        activeTheme = id;
        applyTheme(id);
        for (const select of themeSelects)
            select.value = id;
    }
    function openThemeAbout() {
        const machine = THEME_MACHINES[activeTheme];
        themeAboutHeading.textContent = machine.model;
        themeAboutEra.textContent = machine.year;
        themeAboutFacts.replaceChildren(...machine.facts.map((fact) => {
            const item = doc.createElement('li');
            item.textContent = fact;
            return item;
        }));
        themeAboutImage.hidden = false;
        themeAboutImageFallback.hidden = true;
        themeAboutImage.alt = `${machine.illustration ? 'Illustration' : 'Photograph'} of the ${machine.model}`;
        themeAboutImage.loading = 'eager';
        themeAboutImage.src = machine.imageUrl;
        themeAboutImageCredit.href = machine.imagePage;
        themeAboutImageCredit.textContent = `${machine.illustration ? 'Illustration' : 'Photo'}: ${machine.photoCredit}${machine.licenseUrl ? '' : ` · ${machine.license}`}`;
        themeAboutImageLicense.hidden = !machine.licenseUrl;
        if (machine.licenseUrl) {
            themeAboutImageLicense.href = machine.licenseUrl;
            themeAboutImageLicense.textContent = machine.license;
        }
        themeAboutHistorySource.href = machine.historyUrl;
        themeAboutDialog.showModal();
    }
    for (const select of themeSelects) {
        select.replaceChildren(...THEMES.map((theme) => new Option(theme.label, theme.id)));
        select.value = activeTheme;
        select.addEventListener('change', () => setTheme(select.value), { signal: listeners.signal });
    }
    doc.querySelectorAll('[data-theme-about]').forEach((button) => {
        button.addEventListener('click', openThemeAbout, { signal: listeners.signal });
    });
    themeAboutImage.addEventListener('error', () => {
        themeAboutImage.hidden = true;
        themeAboutImageFallback.hidden = false;
    }, { signal: listeners.signal });
    themeAboutClose.addEventListener('click', () => themeAboutDialog.close(), { signal: listeners.signal });
    return {
        aboutDialog: themeAboutDialog,
        getActiveTheme: () => activeTheme,
        setTheme,
        focusSelector,
        dispose: () => listeners.abort(),
    };
}
