const PREF_PREFIX = 'extensions.readingflow.';

function init() {
    // Access Zotero. In Zotero 9, options_ui can usually find Zotero via top or opener
    const Z = typeof Zotero !== 'undefined' ? Zotero : (window.opener ? window.opener.Zotero : (top.Zotero || null));
    
    if (!Z) {
        console.error('Reading Flow: Zotero not found in preferences context');
        return;
    }

    const completedColor = Z.Prefs.get(PREF_PREFIX + 'color-completed') || '#4caf50';
    const readingColor = Z.Prefs.get(PREF_PREFIX + 'color-reading') || '#2196f3';
    const debounce = Z.Prefs.get(PREF_PREFIX + 'hover-debounce') || 400;

    document.getElementById('color-completed').value = completedColor;
    document.getElementById('color-reading').value = readingColor;
    document.getElementById('hover-debounce').value = debounce;

    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', (e) => {
            let value = e.target.value;
            if (e.target.type === 'number') {
                value = parseInt(value);
            }
            Z.Prefs.set(PREF_PREFIX + e.target.id, value);
        });
    });
}

window.addEventListener('load', init);
