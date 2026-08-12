(() => {
  if (window.__emojiSidebarInjected) return;
  window.__emojiSidebarInjected = true;

  // ---------- Sidebar container ----------
  const sidebar = document.createElement('div');
  Object.assign(sidebar.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '400px',
    height: '100vh',
    backgroundColor: '#2b2d31',
    zIndex: 999999,
    boxShadow: '2px 0 10px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    resize: 'horizontal',
    minWidth: '150px',
    maxWidth: '80vw',
  });

  // iframe loading local main.html in the extension
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    border: 'none',
    width: '100%',
    flex: '1',
  });
  iframe.src = chrome.runtime.getURL('main.html');
  sidebar.appendChild(iframe);

  // Helper to build the small top-right control buttons (close/minimize)
  function makeControlButton({ text, right, title, onClick }) {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      position: 'absolute',
      top: '8px',
      right,
      backgroundColor: 'transparent',
      border: 'none',
      color: '#fff',
      fontSize: '13px',
      width: '24px',
      height: '24px',
      lineHeight: '24px',
      cursor: 'pointer',
      zIndex: 1000001,
      padding: '0',
      textAlign: 'center',
    });
    btn.title = title;
    btn.onclick = onClick;
    return btn;
  }

  // Restore button (shown after minimizing)
  const restoreBtn = document.createElement('button');
  restoreBtn.textContent = '▶';
  Object.assign(restoreBtn.style, {
    position: 'fixed',
    top: '10px',
    left: '10px',
    width: '24px',
    height: '24px',
    backgroundColor: '#5865f2',
    border: 'none',
    borderRadius: '3px',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
    lineHeight: '24px',
    padding: '0',
    zIndex: 1000000,
    display: 'none',
    textAlign: 'center',
  });
  restoreBtn.title = 'Restore Sidebar';
  restoreBtn.onclick = () => {
    sidebar.style.display = 'flex';
    restoreBtn.style.display = 'none';
  };

  const closeBtn = makeControlButton({
    text: '✕',
    right: '8px',
    title: 'Close Sidebar',
    onClick: () => {
      // Fully remove the sidebar from the DOM. Since it's detached,
      // the restore button can no longer bring it back (previously
      // this was broken: restore only toggled display on a node that
      // no longer existed in the document), so remove that too.
      sidebar.remove();
      restoreBtn.remove();
      window.__emojiSidebarInjected = false;
    },
  });

  const minimizeBtn = makeControlButton({
    text: '–',
    right: '38px',
    title: 'Minimize Sidebar',
    onClick: () => {
      sidebar.style.display = 'none';
      restoreBtn.style.display = 'block';
    },
  });

  sidebar.appendChild(closeBtn);
  sidebar.appendChild(minimizeBtn);

  document.body.appendChild(restoreBtn);
  document.body.appendChild(sidebar);

  // ---------- Discord message box helpers ----------

  // Discord's message editor is a Slate.js contenteditable div. Its
  // generated class names change constantly, but it reliably has
  // data-slate-editor="true", role="textbox", and an aria-label that
  // starts with "Message" (e.g. "Message #announcements"). Filtering
  // on that — and requiring the element to actually be visible — keeps
  // us from grabbing some other Slate editor Discord may have mounted
  // (an open edit box, a thread reply box, etc.) instead of the real
  // compose box.
  function getMessageBox() {
    const candidates = document.querySelectorAll(
      'div[data-slate-editor="true"][role="textbox"]'
    );
    for (const el of candidates) {
      const label = el.getAttribute('aria-label') || '';
      if (label.startsWith('Message') && el.offsetParent !== null) {
        return el;
      }
    }
    // Fallback in case Discord changes the aria-label wording again.
    return document.querySelector('[contenteditable="true"][data-slate-editor="true"]');
  }

  // Places the caret at the very end of the editor's current content.
  function focusAtEnd(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Inserts text the way a real user action would. Manually building a
  // "beforeinput" InputEvent (the old approach) no longer works because
  // Discord's current Slate editor relies on the browser-native
  // getTargetRanges() data attached to *real* input events — a
  // script-constructed InputEvent can't carry that, so it gets ignored.
  //
  // document.execCommand('insertText', ...) still produces a genuinely
  // trusted, native input event, so it's tried first. A simulated paste
  // event (which Slate also handles natively) is the fallback.
  function insertText(el, text) {
    focusAtEnd(el);

    const before = el.textContent;
    const inserted = !!(document.execCommand && document.execCommand('insertText', false, text));

    if (inserted && el.textContent !== before) return;

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(pasteEvent);
  }

  // Presses Enter to send the current message.
  function pressEnter(el) {
    const options = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new KeyboardEvent('keydown', options));
    el.dispatchEvent(new KeyboardEvent('keyup', options));
  }

  function insertAndSend(url) {
    const inputBox = getMessageBox();
    if (!inputBox) {
      console.warn('[Emoji Sidebar] Could not find the Discord message box.');
      return;
    }

    insertText(inputBox, url);

    // Wait a couple of paint cycles so Discord's React state has
    // actually picked up the inserted text before pressing Enter —
    // otherwise Enter can fire while the box still reads as empty.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => pressEnter(inputBox));
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.data?.type === 'insertEmojiUrl' && typeof event.data.url === 'string') {
      insertAndSend(event.data.url);
    }
  });
})();
