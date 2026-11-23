(function () {
  document.addEventListener('load', function initialize(event) {
    const pane = event.target;
    if (pane?.id !== 'readingflow-prefs') return;
    document.removeEventListener('load', initialize, true);

    const field = name => pane.querySelector('#readingflow-pref-' + name);
    const message = field('sidebar-message');
    const create = field('sidebar-create');
    const remove = field('sidebar-remove');
    const automaticRead = field('auto-complete');
    const density = field('density');
    const newItemStatus = field('new-item-status');
    let sidebarRequest = 0;

    async function updateSidebar(action, isMutation = false) {
      const settings = Zotero.ReadingFlowPreferences;
      if (!settings) return;
      const request = ++sidebarRequest;
      if (isMutation) create.disabled = remove.disabled = true;
      try {
        const text = await settings[action]();
        if (request === sidebarRequest) message.textContent = text;
      } finally {
        if (isMutation) create.disabled = remove.disabled = false;
      }
    }

    const settings = Zotero.ReadingFlowPreferences;
    if (settings) {
      automaticRead.value = settings.getAutomaticReadMode();
      automaticRead.disabled = false;
      automaticRead.addEventListener('change', () => settings.setAutomaticReadMode(automaticRead.value));
    }

    create.addEventListener('click', () => void updateSidebar('createSidebarSearch', true));
    remove.addEventListener('click', () => void updateSidebar('removeSidebarSearch', true));
    density.addEventListener('change', () => Zotero.ReadingFlowColumnManager?.setDisplayDensity(density.value, text => {
      field('density-message').textContent = text;
    }));
    newItemStatus.addEventListener('change', () => Zotero.ReadingFlowPreferences?.setNewItemStatus(newItemStatus.value));
    void updateSidebar('refreshSidebarSearchStatus');
  }, true);
})();
