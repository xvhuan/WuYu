(() => {
  const quotesContainer = document.getElementById('quotes-container');
  const sentinel = document.getElementById('load-more-sentinel');
  const emptyState = document.getElementById('empty-state');
  const listLoading = document.getElementById('list-loading');
  const searchInput = document.getElementById('search-input');

  const modalOverlay = document.getElementById('modal-overlay');
  const openModalBtn = document.getElementById('open-modal-btn');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const form = document.getElementById('quote-form');
  const formError = document.getElementById('form-error');
  const textInputField = document.getElementById('text');
  const passwordInput = document.getElementById('password');
  const passwordLabel = document.querySelector("label[for='password']");
  const passwordFieldWrapper = document.querySelector('.password-field');
  const togglePasswordBtn = document.getElementById('toggle-password-visibility');
  const fileInput = document.getElementById('screenshot');
  const fileDropArea = document.getElementById('file-drop-area');
  const fileHint = document.getElementById('file-hint');
  const DEFAULT_FILE_HINT = '截图可选：可以点击选择、拖拽截图到这里，或直接粘贴。';
  const imageViewer = document.getElementById('image-viewer');
  const imageViewerImg = document.getElementById('image-viewer-img');
  const imageViewerClose = document.getElementById('image-viewer-close');
  const imageViewerZoomIn = document.getElementById('image-viewer-zoom-in');
  const imageViewerZoomOut = document.getElementById('image-viewer-zoom-out');
  const imageViewerZoomReset = document.getElementById('image-viewer-zoom-reset');
  const imageViewerZoomValue = document.getElementById('image-viewer-zoom-value');
  const imageViewerScroll = document.querySelector('.image-viewer-scroll');

  const timelineContainer = quotesContainer;

  let page = 1;
  const pageSize = 5;
  let loading = false;
  let hasMore = true;
  let currentSearch = '';
  let selectedFile = null;
  let currentTimelineIndex = -1;
  let isTimelineDragging = false;
  let timelineWheel = null;
  let timelineWheelInner = null;
  let timelineWheelItems = [];
  let timelineDates = [];
  let cardIndexToDateIndex = [];
  let wheelDragStartY = null;
  let wheelDragStartIndex = null;
  let wheelDragLastSteps = 0;
  let wheelDragBaseOffset = 0;
  const PASSWORD_STORAGE_KEY = 'bo_saved_password';
  let uploadPasswordRequired = true;
  const SITE_NAME_DEFAULT = '吾语';
  let currentSiteName = SITE_NAME_DEFAULT;
  let currentDateFontSize = 12;
  let currentTextFontSize = 15;
  let imageViewerScale = 1;
  const IMAGE_VIEWER_MIN_SCALE = 0.5;
  const IMAGE_VIEWER_MAX_SCALE = 3;
  const IMAGE_VIEWER_SCALE_STEP = 0.15;
  let imageViewerNaturalWidth = 0;
  let imageViewerNaturalHeight = 0;

  function getSavedPassword() {
    try {
      return localStorage.getItem(PASSWORD_STORAGE_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function persistPassword(value) {
    try {
      if (value && uploadPasswordRequired) {
        localStorage.setItem(PASSWORD_STORAGE_KEY, value);
      } else {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
      }
    } catch (err) {
      // localStorage 可能不可用，忽略
    }
  }

  function applySavedPassword() {
    if (!passwordInput) return;
    if (!uploadPasswordRequired) {
      passwordInput.value = '';
      return;
    }
    const saved = getSavedPassword();
    if (saved) {
      passwordInput.value = saved;
    }
  }

  applySavedPassword();

  function applyFontSettings(dateSize, textSize) {
    const root = document.documentElement;
    if (Number.isFinite(dateSize)) {
      currentDateFontSize = dateSize;
      root.style.setProperty('--quote-date-size', `${dateSize}px`);
    }
    if (Number.isFinite(textSize)) {
      currentTextFontSize = textSize;
      root.style.setProperty('--quote-text-size', `${textSize}px`);
    }
  }

  applyFontSettings(currentDateFontSize, currentTextFontSize);

  function applySiteName(name) {
    const nextName = name && name.trim() ? name.trim() : SITE_NAME_DEFAULT;
    currentSiteName = nextName;
    document.title = currentSiteName;
    const siteNameEls = document.querySelectorAll('[data-site-name]');
    siteNameEls.forEach((el) => {
      el.textContent = currentSiteName;
    });
    if (textInputField) {
      textInputField.placeholder = `写下那句好玩的${currentSiteName}`;
    }
  }

  applySiteName(SITE_NAME_DEFAULT);

  function updatePasswordRequirementUI() {
    if (passwordInput) {
      passwordInput.required = uploadPasswordRequired;
      if (!uploadPasswordRequired) {
        passwordInput.value = '';
      } else if (!passwordInput.value) {
        applySavedPassword();
      }
    }
    if (passwordLabel) {
      passwordLabel.classList.toggle('hidden', !uploadPasswordRequired);
    }
    if (passwordFieldWrapper) {
      passwordFieldWrapper.classList.toggle('hidden', !uploadPasswordRequired);
    }
  }

  async function fetchPublicSettings() {
    try {
      const resp = await fetch('/api/public-settings');
      if (resp.ok) {
        const data = await resp.json();
        uploadPasswordRequired = data.requireUploadPassword !== false;
        if (typeof data.siteName === 'string') {
          applySiteName(data.siteName);
        } else {
          applySiteName(SITE_NAME_DEFAULT);
        }
        const dateSize = Number(data.dateFontSize);
        const textSize = Number(data.textFontSize);
        applyFontSettings(
          Number.isFinite(dateSize) ? dateSize : currentDateFontSize,
          Number.isFinite(textSize) ? textSize : currentTextFontSize
        );
      }
    } catch (err) {
      uploadPasswordRequired = true;
      applySiteName(SITE_NAME_DEFAULT);
    } finally {
      updatePasswordRequirementUI();
    }
  }

  function getQuoteCards() {
    if (!quotesContainer) return [];
    return Array.from(quotesContainer.getElementsByClassName('quote-card'));
  }

  function ensureTimelineIndicator() {
  }

  function rebuildTimelineWheel() {
    if (!timelineContainer) return;

    const cards = getQuoteCards();
    timelineDates = [];
    cardIndexToDateIndex = [];

    const dateToIndex = new Map();
    cards.forEach((card, cardIndex) => {
      const date = card.dataset.date || '';
      if (!date) return;
      let dateIndex = dateToIndex.get(date);
      if (dateIndex === undefined) {
        dateIndex = timelineDates.length;
        dateToIndex.set(date, dateIndex);
        timelineDates.push({
          date,
          cardIndices: []
        });
      }
      timelineDates[dateIndex].cardIndices.push(cardIndex);
      cardIndexToDateIndex[cardIndex] = dateIndex;
    });

    if (!timelineWheel || !timelineWheel.isConnected) {
      timelineWheel = document.createElement('div');
      timelineWheel.className = 'timeline-wheel';
      timelineWheelInner = document.createElement('div');
      timelineWheelInner.className = 'timeline-wheel-inner';
      timelineWheel.appendChild(timelineWheelInner);
      timelineContainer.appendChild(timelineWheel);
      // eslint-disable-next-line no-console
      console.log('[timeline] created wheel');
    }
    if (!timelineWheelInner || !timelineWheelInner.isConnected) {
      timelineWheelInner = timelineWheel.querySelector('.timeline-wheel-inner');
      if (!timelineWheelInner) {
        timelineWheelInner = document.createElement('div');
        timelineWheelInner.className = 'timeline-wheel-inner';
        timelineWheel.appendChild(timelineWheelInner);
      }
    }
    if (!timelineWheelInner) return;

    timelineWheelInner.innerHTML = '';
    timelineWheelItems = timelineDates.map((entry, index) => {
      const item = document.createElement('div');
      item.className = 'timeline-wheel-item';
      item.textContent = entry.date || '';
      item.dataset.index = String(index);
      timelineWheelInner.appendChild(item);
      return item;
    });

    timelineWheel.onmousedown = (e) => {
      if (e.button !== 0) return;
      if (!timelineDates.length) return;
      e.preventDefault();
      isTimelineDragging = true;
      document.body.classList.add('timeline-dragging');
      timelineContainer.classList.add('timeline-active');
      wheelDragStartY = e.clientY;
      if (currentTimelineIndex < 0) {
        currentTimelineIndex = 0;
      }
      wheelDragStartIndex = currentTimelineIndex;
      wheelDragLastSteps = 0;

      const itemHeight =
        timelineWheelItems[0].getBoundingClientRect().height || 24;
      const wheelRect = timelineWheel.getBoundingClientRect();
      const centerOffset = wheelRect.height / 2 - itemHeight / 2;
      wheelDragBaseOffset =
        centerOffset - wheelDragStartIndex * itemHeight;

      const handleMove = (ev) => {
        if (!isTimelineDragging) return;
        const itemHeight =
          timelineWheelItems[0].getBoundingClientRect().height || 24;
        if (!itemHeight) return;
        const delta = ev.clientY - wheelDragStartY;
        const steps = Math.round(-delta / itemHeight);
        wheelDragLastSteps = steps;

        const previewIndex = Math.max(
          0,
          Math.min(timelineDates.length - 1, wheelDragStartIndex + steps)
        );

        const wheelRect = timelineWheel.getBoundingClientRect();
        const centerOffset = wheelRect.height / 2 - itemHeight / 2;
        const offset = centerOffset - previewIndex * itemHeight;
        timelineWheelInner.style.transform = `translateY(${offset}px)`;

        if (timelineWheelItems.length) {
          timelineWheelItems.forEach((item, i) => {
            item.classList.remove('active', 'near');
            if (i === previewIndex) {
              item.classList.add('active');
            } else if (Math.abs(i - previewIndex) === 1) {
              item.classList.add('near');
            }
          });
        }

      };

      const handleUp = () => {
        if (!isTimelineDragging) return;
        isTimelineDragging = false;
        document.body.classList.remove('timeline-dragging');
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);

        const steps = wheelDragLastSteps || 0;
        let nextIndex = wheelDragStartIndex + steps;
        nextIndex = Math.max(0, Math.min(timelineDates.length - 1, nextIndex));
        if (nextIndex !== currentTimelineIndex) {
          updateIndicatorForIndex(nextIndex, { scroll: true, activate: true });
        }

      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    };
  }

  function setSelectedFile(file, source) {
    if (!file) {
      selectedFile = null;
      if (fileInput) {
        fileInput.value = '';
      }
      if (fileHint) {
        fileHint.textContent = DEFAULT_FILE_HINT;
      }
      return;
    }
    if (!file.type || !file.type.startsWith('image/')) {
      formError.textContent = '请上传图片文件。';
      return;
    }
    selectedFile = file;
    if (source === 'paste' || source === 'drop') {
      if (fileInput) {
        fileInput.value = '';
      }
    }
    if (fileHint) {
      const name = file.name || (source === 'paste' ? '剪贴板图片' : '图片');
      fileHint.textContent = `已选择：${name}`;
    }
  }

  function openImageViewer(src) {
    if (!src || !imageViewer || !imageViewerImg) return;
    imageViewerNaturalWidth = 0;
    imageViewerNaturalHeight = 0;
    const handleLoad = () => {
      imageViewerNaturalWidth =
        imageViewerImg.naturalWidth || imageViewerImg.clientWidth || 0;
      imageViewerNaturalHeight =
        imageViewerImg.naturalHeight || imageViewerImg.clientHeight || 0;
      setImageViewerScale(1, true);
    };
    imageViewerImg.onload = handleLoad;
    imageViewerImg.src = src;
    if (imageViewerImg.complete) {
      handleLoad();
    }
    imageViewer.classList.remove('hidden');
    const raf = window.requestAnimationFrame || window.setTimeout;
    raf(() => {
      imageViewer.classList.add('image-viewer-visible');
    }, 16);
  }

  function closeImageViewer() {
    if (!imageViewer) return;
    imageViewer.classList.remove('image-viewer-visible');
    setTimeout(() => {
      if (imageViewer.classList.contains('image-viewer-visible')) return;
      imageViewer.classList.add('hidden');
      if (imageViewerImg) {
        imageViewerImg.removeAttribute('src');
        imageViewerImg.style.width = '';
        imageViewerImg.style.height = '';
        setImageViewerScale(1, true);
      }
    }, 200);
  }

  function setImageViewerScale(value, force = false) {
    const next = Math.min(
      IMAGE_VIEWER_MAX_SCALE,
      Math.max(IMAGE_VIEWER_MIN_SCALE, value)
    );
    if (!force && Math.abs(next - imageViewerScale) < 0.001) return;
    imageViewerScale = next;
    if (imageViewerImg) {
      const baseWidth =
        imageViewerNaturalWidth ||
        imageViewerImg.naturalWidth ||
        imageViewerImg.clientWidth ||
        0;
      const baseHeight =
        imageViewerNaturalHeight ||
        imageViewerImg.naturalHeight ||
        imageViewerImg.clientHeight ||
        0;
      if (baseWidth) {
        imageViewerImg.style.width = `${baseWidth * imageViewerScale}px`;
      }
      if (baseHeight) {
        imageViewerImg.style.height = `${baseHeight * imageViewerScale}px`;
      }
      imageViewerImg.style.maxWidth = 'none';
    }
    if (imageViewerZoomValue) {
      imageViewerZoomValue.textContent = `${Math.round(imageViewerScale * 100)}%`;
    }
  }

  function zoomImageViewer(step) {
    setImageViewerScale(imageViewerScale + step);
  }

  function renderQuote(item, append = true) {
    const card = document.createElement('article');
    card.className = 'quote-card';
    card.dataset.date = item.date || '';

    const dot = document.createElement('div');
    dot.className = 'quote-timeline-dot';
    card.appendChild(dot);

    const meta = document.createElement('div');
    meta.className = 'quote-meta';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'quote-date';
    dateSpan.textContent = item.date || '';
    meta.appendChild(dateSpan);
    card.appendChild(meta);

    const textEl = document.createElement('div');
    textEl.className = 'quote-text';
    textEl.textContent = item.text || '';
    card.appendChild(textEl);

    if (item.imageUrl) {
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'quote-image-wrapper';
      const img = document.createElement('img');
      img.className = 'quote-image';
      img.src = item.imageUrl;
      img.alt = `${currentSiteName}截图`;
      img.addEventListener('click', () => openImageViewer(item.imageUrl));
      imgWrapper.appendChild(img);
      card.appendChild(imgWrapper);
    }

    card.addEventListener('mouseenter', () => {
      const cards = getQuoteCards();
      const idx = cards.indexOf(card);
      if (idx !== -1) {
        const dateIndex = cardIndexToDateIndex[idx];
        if (dateIndex !== undefined) {
          updateIndicatorForIndex(dateIndex, { scroll: false, activate: true });
        }
      }
    });

    card.addEventListener('mouseleave', () => {
      if (!isTimelineDragging && timelineContainer) {
        timelineContainer.classList.remove('timeline-active');
      }
    });

    if (append) {
      quotesContainer.appendChild(card);
    } else {
      quotesContainer.insertBefore(card, quotesContainer.firstChild);
    }
  }

  function updateIndicatorForIndex(index, options = {}) {
    const { scroll = false, activate = false } = options;
    const cards = getQuoteCards();
    if (!timelineContainer || !cards.length || !timelineDates.length) return;
    if (index < 0 || index >= timelineDates.length) return;

    const dateEntry = timelineDates[index];
    const firstCardIndex = dateEntry.cardIndices[0];
    const card = cards[firstCardIndex];
    currentTimelineIndex = index;

    cards.forEach((c, i) => {
      if (i === firstCardIndex) {
        c.classList.add('timeline-current');
      } else {
        c.classList.remove('timeline-current');
      }
    });

    if (timelineWheel && timelineWheelInner && timelineWheelItems.length) {
      const itemHeight =
        timelineWheelItems[0].getBoundingClientRect().height || 24;
      const wheelRect = timelineWheel.getBoundingClientRect();
      const centerOffset = wheelRect.height / 2 - itemHeight / 2;
      const offset = centerOffset - index * itemHeight;
      timelineWheelInner.style.transform = `translateY(${offset}px)`;

      timelineWheelItems.forEach((item, i) => {
        item.classList.remove('active', 'near');
        if (i === index) {
          item.classList.add('active');
        } else if (Math.abs(i - index) === 1) {
          item.classList.add('near');
        }
      });
    }

    if (activate) {
      timelineContainer.classList.add('timeline-active');
    }
    if (scroll) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function getNearestCardIndexByOffset(offsetY) {
    const cards = getQuoteCards();
    if (!cards.length) return -1;
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      const center = card.offsetTop + card.offsetHeight / 2;
      const dist = Math.abs(center - offsetY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function handleTimelineHoverMove(e) {
    if (!timelineContainer || isTimelineDragging) return;
    const rect = timelineContainer.getBoundingClientRect();
    const offsetY = e.clientY - rect.top + window.scrollY - window.scrollY;
    const cardIndex = getNearestCardIndexByOffset(offsetY);
    if (cardIndex === -1) return;
    const dateIndex = cardIndexToDateIndex[cardIndex];
    if (dateIndex === undefined) return;
    updateIndicatorForIndex(dateIndex, { scroll: false, activate: true });
  }

  function handleTimelineDragMove(e) {
    if (!isTimelineDragging || !timelineContainer) return;
    const rect = timelineContainer.getBoundingClientRect();
    const offsetY = e.clientY - rect.top + window.scrollY - window.scrollY;
    const cardIndex = getNearestCardIndexByOffset(offsetY);
    if (cardIndex === -1) return;
    const dateIndex = cardIndexToDateIndex[cardIndex];
    if (dateIndex === undefined) return;
    updateIndicatorForIndex(dateIndex, { scroll: true, activate: true });
  }

  function ensureContentFillsViewport() {
    const doc = document.documentElement;
    if (!doc) return;
    if (doc.scrollHeight <= window.innerHeight + 80 && hasMore && !loading) {
      loadQuotes();
    }
  }

  async function loadQuotes({ reset = false } = {}) {
    if (loading || (!hasMore && !reset)) return;
    loading = true;
    listLoading.classList.remove('hidden');

    if (reset) {
      page = 1;
      hasMore = true;
      quotesContainer.innerHTML = '';
      emptyState.classList.add('hidden');
    }

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize)
      });
      if (currentSearch.trim()) {
        params.append('search', currentSearch.trim());
      }
      const resp = await fetch(`/api/quotes?${params.toString()}`);
      if (!resp.ok) {
        throw new Error('加载失败');
      }
      const data = await resp.json();

      if (reset && (!data.items || data.items.length === 0)) {
        emptyState.classList.remove('hidden');
      } else {
        emptyState.classList.add('hidden');
      }

      (data.items || []).forEach((item) => renderQuote(item, true));

      const cards = getQuoteCards();
      rebuildTimelineWheel();
      if (cards.length && currentTimelineIndex < 0) {
        currentTimelineIndex = 0;
        updateIndicatorForIndex(0, { scroll: false });
      } else if (cards.length) {
        const safeIndex = Math.min(currentTimelineIndex, cards.length - 1);
        updateIndicatorForIndex(safeIndex, { scroll: false });
      }

      hasMore = !!data.hasMore;
      if (hasMore) {
        page += 1;
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
      listLoading.classList.add('hidden');
      ensureContentFillsViewport();
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadQuotes();
        }
      });
    },
    {
      rootMargin: '200px 0px 0px 0px'
    }
  );

  observer.observe(sentinel);

  if (timelineContainer) {
    timelineContainer.addEventListener('mousemove', (e) => {
      const rect = timelineContainer.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;

      let nearTimeline = relativeX >= 0 && relativeX <= 40;

      if (!nearTimeline && timelineWheel) {
        const wheelRect = timelineWheel.getBoundingClientRect();
        if (
          e.clientX >= wheelRect.left &&
          e.clientX <= wheelRect.right &&
          e.clientY >= wheelRect.top &&
          e.clientY <= wheelRect.bottom
        ) {
          nearTimeline = true;
        }
      }

      if (!nearTimeline && !isTimelineDragging) {
        timelineContainer.classList.remove('timeline-active');
        return;
      }

      timelineContainer.classList.add('timeline-active');

      if (relativeX >= 0 && relativeX <= 40) {
        if (timelineWheel) {
          const wheelRect = timelineWheel.getBoundingClientRect();
          const wheelHeight = wheelRect.height || 160;
          let top = e.clientY - rect.top - wheelHeight / 2;
          const maxTop = Math.max(0, rect.height - wheelHeight);
          if (top < 0) top = 0;
          else if (top > maxTop) top = maxTop;
          timelineWheel.style.top = `${top}px`;
        }

        handleTimelineHoverMove(e);
      }

    });

    timelineContainer.addEventListener(
      'wheel',
      (e) => {
        const rect = timelineContainer.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;

        let overTimeline = relativeX >= 0 && relativeX <= 40;

        if (!overTimeline && timelineWheel) {
          const wheelRect = timelineWheel.getBoundingClientRect();
          if (
            e.clientX >= wheelRect.left &&
            e.clientX <= wheelRect.right &&
            e.clientY >= wheelRect.top &&
            e.clientY <= wheelRect.bottom
          ) {
            overTimeline = true;
          }
        }

        if (!overTimeline) {
          return;
        }

        e.preventDefault();
        if (!timelineDates.length) return;
        if (currentTimelineIndex < 0) currentTimelineIndex = 0;
        const dir = e.deltaY > 0 ? 1 : -1;
        let nextIndex = currentTimelineIndex + dir;
        nextIndex = Math.max(0, Math.min(timelineDates.length - 1, nextIndex));
        if (nextIndex !== currentTimelineIndex) {
          updateIndicatorForIndex(nextIndex, { scroll: true, activate: true });

          // 滚轮滚动后，让日期滚轮窗口跟随当前鼠标的纵向位置
          if (timelineWheel) {
            const wheelRect2 = timelineWheel.getBoundingClientRect();
            const wheelHeight = wheelRect2.height || 160;
            let top = e.clientY - rect.top - wheelHeight / 2;
            const maxTop = Math.max(0, rect.height - wheelHeight);
            if (top < 0) top = 0;
            else if (top > maxTop) top = maxTop;
            timelineWheel.style.top = `${top}px`;
          }
        }

      },
      { passive: false }
    );
  }

  function openModal() {
    modalOverlay.classList.remove('hidden');
    const raf = window.requestAnimationFrame || window.setTimeout;
    raf(() => {
      modalOverlay.classList.add('modal-visible');
    }, 16);
  }

  function closeModal() {
    modalOverlay.classList.remove('modal-visible');
    setTimeout(() => {
      modalOverlay.classList.add('hidden');
    }, 220);
    form.reset();
    formError.textContent = '';
    if (passwordInput) {
      passwordInput.type = 'password';
    }
    if (togglePasswordBtn) {
      togglePasswordBtn.classList.remove('active');
    }
    setSelectedFile(null);
    applySavedPassword();
  }

  openModalBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modalOverlay.classList.contains('hidden')) {
      closeModal();
      return;
    }
    if (imageViewer && !imageViewer.classList.contains('hidden')) {
      closeImageViewer();
    }
  });

  if (imageViewerClose) {
    imageViewerClose.addEventListener('click', closeImageViewer);
  }

  if (imageViewer) {
    imageViewer.addEventListener('click', (e) => {
      if (e.target === imageViewer) {
        closeImageViewer();
      }
    });
  }

  if (imageViewerScroll) {
    imageViewerScroll.addEventListener(
      'wheel',
      (e) => {
        if (!imageViewer || imageViewer.classList.contains('hidden')) return;
        if (e.ctrlKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? IMAGE_VIEWER_SCALE_STEP : -IMAGE_VIEWER_SCALE_STEP;
          zoomImageViewer(delta);
        }
      },
      { passive: false }
    );
    imageViewerScroll.addEventListener('dblclick', () => {
      if (imageViewer) {
        const nextScale = imageViewerScale >= 1.5 ? 1 : 2;
        setImageViewerScale(nextScale);
      }
    });
  }

  if (imageViewerZoomIn) {
    imageViewerZoomIn.addEventListener('click', () => zoomImageViewer(IMAGE_VIEWER_SCALE_STEP));
  }
  if (imageViewerZoomOut) {
    imageViewerZoomOut.addEventListener('click', () => zoomImageViewer(-IMAGE_VIEWER_SCALE_STEP));
  }
  if (imageViewerZoomReset) {
    imageViewerZoomReset.addEventListener('click', () => setImageViewerScale(1));
  }

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      togglePasswordBtn.classList.toggle('active', isHidden);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) {
        setSelectedFile(file, 'input');
      } else {
        setSelectedFile(null);
      }
    });
  }

  if (fileDropArea) {
    fileDropArea.addEventListener('click', (e) => {
      if (!fileInput) return;
      if (e.target === fileDropArea || e.target === fileHint) {
        fileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      fileDropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropArea.classList.add('dragover');
      });
    });

    ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
      fileDropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropArea.classList.remove('dragover');
      });
    });

    fileDropArea.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (!dt || !dt.files || !dt.files.length) return;
      const file = dt.files[0];
      if (file) {
        setSelectedFile(file, 'drop');
      }
    });
  }

  document.addEventListener('paste', (e) => {
    if (modalOverlay.classList.contains('hidden')) return;
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const items = clipboardData.items || [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setSelectedFile(file, 'paste');
        }
        break;
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.textContent = '';
    const text = form.elements.text.value.trim();
    const date = form.elements.date.value;
    const password = passwordInput ? passwordInput.value : '';
    const fileFromInput = fileInput && fileInput.files && fileInput.files[0];
    const file = selectedFile || fileFromInput;

    if (!text || !date || (uploadPasswordRequired && !password)) {
      formError.textContent = uploadPasswordRequired
        ? '语录、日期和密码都是必填的。'
        : '语录和日期都是必填的。';
      return;
    }

    if (file && (!file.type || !file.type.startsWith('image/'))) {
      formError.textContent = '请上传图片文件。';
      return;
    }

    const formData = new FormData();
    formData.append('text', text);
    formData.append('date', date);
    if (uploadPasswordRequired || password) {
      formData.append('password', password);
    }
    if (file) {
      formData.append('screenshot', file);
    }

    try {
      const resp = await fetch('/api/quotes', {
        method: 'POST',
        body: formData
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        formError.textContent = data.error || '保存失败，请稍后再试。';
        return;
      }
      const data = await resp.json();
      if (uploadPasswordRequired && password) {
        persistPassword(password);
      } else if (!uploadPasswordRequired) {
        persistPassword('');
      }
      closeModal();
      page = 1;
      hasMore = true;
      quotesContainer.innerHTML = '';
      await loadQuotes({ reset: true });
    } catch (err) {
      formError.textContent = '网络有点问题，稍后再试。';
    }
  });

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    const value = searchInput.value || '';
    currentSearch = value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadQuotes({ reset: true });
    }, 300);
  });

  fetchPublicSettings();
  const init = async () => {
    await fetchPublicSettings();
    await loadQuotes({ reset: true });
  };

  init();
})();
  let imageViewerScale = 1;
  const IMAGE_VIEWER_MIN_SCALE = 0.5;
  const IMAGE_VIEWER_MAX_SCALE = 3;
  const IMAGE_VIEWER_SCALE_STEP = 0.15;
