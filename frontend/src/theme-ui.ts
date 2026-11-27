import { THEMES, applyTheme, loadTheme, type ThemeId } from './theme.js';
import { THEME_MACHINES } from './theme-machines.js';

export interface ThemeUiController {
  readonly aboutDialog: HTMLDialogElement;
  getActiveTheme(): ThemeId;
  setTheme(id: ThemeId): void;
  focusSelector(): void;
  dispose(): void;
}

export function initThemeUi(doc: Document = document): ThemeUiController {
  let activeTheme = loadTheme();
  const themeSelects = Array.from(doc.querySelectorAll<HTMLSelectElement>('.theme-select'));
  const themeAboutDialog = doc.querySelector<HTMLDialogElement>('#theme-about-dialog')!;
  const themeAboutHeading = doc.querySelector<HTMLElement>('#theme-about-heading')!;
  const themeAboutEra = doc.querySelector<HTMLElement>('#theme-about-era')!;
  const themeAboutImage = doc.querySelector<HTMLImageElement>('#theme-about-image')!;
  const themeAboutImageFallback = doc.querySelector<HTMLElement>('#theme-about-image-fallback')!;
  const themeAboutFacts = doc.querySelector<HTMLUListElement>('#theme-about-facts')!;
  const themeAboutImageCredit = doc.querySelector<HTMLAnchorElement>('#theme-about-image-credit')!;
  const themeAboutImageLicense = doc.querySelector<HTMLAnchorElement>('#theme-about-image-license')!;
  const themeAboutHistorySource = doc.querySelector<HTMLAnchorElement>('#theme-about-history-source')!;
  const themeAboutClose = doc.querySelector<HTMLButtonElement>('#theme-about-close')!;
  const listeners = new AbortController();

  function focusSelector(): void {
    const selector = themeSelects.find((select) =>
      select.closest('[hidden]') === null && select.getClientRects().length > 0,
    );
    selector?.focus();
  }

  function setTheme(id: ThemeId): void {
    activeTheme = id;
    applyTheme(id);
    for (const select of themeSelects) select.value = id;
  }

  function openThemeAbout(): void {
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
    select.addEventListener('change', () => setTheme(select.value as ThemeId), { signal: listeners.signal });
  }
  doc.querySelectorAll<HTMLButtonElement>('[data-theme-about]').forEach((button) => {
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
