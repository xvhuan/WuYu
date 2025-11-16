(() => {
  const quotesContainer = document.getElementById('admin-quotes-container');
  const sentinel = document.getElementById('admin-load-more-sentinel');
  const emptyState = document.getElementById('admin-empty-state');
  const listLoading = document.getElementById('admin-list-loading');
  const searchInput = document.getElementById('admin-search-input');
  const toastEl = document.getElementById('admin-toast');

  const editOverlay = document.getElementById('admin-edit-overlay');
  const editForm = document.getElementById('admin-edit-form');
  const editTextInput = document.getElementById('admin-edit-text');
  const editDateInput = document.getElementById('admin-edit-date');
  const editError = document.getElementById('admin-edit-error');
  const editCloseBtn = document.getElementById('admin-edit-close');
  const editCancelBtn = document.getElementById('admin-edit-cancel');
  const editImageInput = document.getElementById('admin-edit-image');
  const editImageDropArea = document.getElementById('admin-edit-drop-area');
  const editImageStatus = document.getElementById('admin-edit-image-status');
  const editImageRemoveBtn = document.getElementById('admin-edit-image-remove');
  const settingsBtn = document.getElementById('admin-settings-btn');
  const settingsOverlay = document.getElementById('admin-settings-overlay');
  const settingsForm = document.getElementById('admin-settings-form');
  const settingsCloseBtn = document.getElementById('admin-settings-close');
  const settingsCancelBtn = document.getElementById('admin-settings-cancel');
  const settingsRequireCheckbox = document.getElementById('admin-settings-require-password');
  const settingsRequireHomeCheckbox = document.getElementById('admin-settings-require-home-password');
  const settingsUploadPasswordInput = document.getElementById('admin-settings-upload-password');
  const settingsAdminPasswordInput = document.getElementById('admin-settings-admin-password');
  const settingsAdminPathInput = document.getElementById('admin-settings-admin-path');
  const settingsSiteNameInput = document.getElementById('admin-settings-site-name');
  const settingsDateFontInput = document.getElementById('admin-settings-date-font');
  const settingsTextFontInput = document.getElementById('admin-settings-text-font');
  const settingsError = document.getElementById('admin-settings-error');
  const siteNameEls = document.querySelectorAll('[data-site-name]');

  let page = 1;
  const pageSize = 10;
  let loading = false;
  let hasMore = true;
  let currentSearch = '';
  let observer = null;
  let editingItem = null;
  let editingCard = null;
  let editSelectedImageFile = null;
  let editRemoveImage = false;
  let settingsLoaded = false;
  const EDIT_IMAGE_DEFAULT_HINT = '当前没有截图，可以点击或拖拽文件到这里。';
  const ADMIN_SITE_NAME_DEFAULT = '吾语';
  let currentSiteName = ADMIN_SITE_NAME_DEFAULT;
  let currentDateFontSize = 12;
  let currentTextFontSize = 15;
  const ADMIN_PATH_DEFAULT = '/iusadmin';
  let currentAdminPath = ADMIN_PATH_DEFAULT;

  function openEditOverlay() {
    if (!editOverlay) return;
    editOverlay.classList.remove('hidden');
    const raf = window.requestAnimationFrame || window.setTimeout;
    raf(() => {
      editOverlay.classList.add('modal-visible');
    }, 16);
  }

  function closeEditOverlay() {
    if (!editOverlay) return;
    editOverlay.classList.remove('modal-visible');
    setTimeout(() => {
      editOverlay.classList.add('hidden');
    }, 220);
  }

  function openSettingsOverlay() {
    if (!settingsOverlay) return;
    settingsOverlay.classList.remove('hidden');
    const raf = window.requestAnimationFrame || window.setTimeout;
    raf(() => {
      settingsOverlay.classList.add('modal-visible');
    }, 16);
  }

  function closeSettingsOverlay() {
    if (!settingsOverlay) return;
    settingsOverlay.classList.remove('modal-visible');
    setTimeout(() => {
      settingsOverlay.classList.add('hidden');
    }, 220);
    if (settingsForm) {
      settingsForm.reset();
    }
    if (settingsError) {
      settingsError.textContent = '';
    }
  }

  function updateEditImageStatus() {
    if (!editImageStatus) return;
    if (editSelectedImageFile) {
      const name = editSelectedImageFile.name || '图片';
      editImageStatus.textContent = `已选择新截图：${name}`;
      return;
    }
    if (editRemoveImage) {
      editImageStatus.textContent = '保存后将清除当前截图。';
    } else if (editingItem && editingItem.imageUrl) {
      editImageStatus.textContent = '当前已保存截图，拖入或点击可更换，留空保持不变。';
    } else {
      editImageStatus.textContent = EDIT_IMAGE_DEFAULT_HINT;
    }
  }

  function updateEditImageRemoveButton() {
    if (!editImageRemoveBtn) return;
    if (editingItem && editingItem.imageUrl) {
      editImageRemoveBtn.textContent = editRemoveImage ? '撤销清除' : '清除当前截图';
    } else {
      editImageRemoveBtn.textContent = '清空选择';
    }
  }

  function resetEditImageState() {
    editSelectedImageFile = null;
    editRemoveImage = false;
    if (editImageInput) {
      editImageInput.value = '';
    }
    updateEditImageStatus();
    updateEditImageRemoveButton();
  }

  function setEditImageFile(file, source) {
    if (file && file.type && !file.type.startsWith('image/')) {
      if (source === 'input' && editImageInput) {
        editImageInput.value = '';
      }
      if (editImageStatus) {
        editImageStatus.textContent = '请上传图片文件。';
      }
      return;
    }
    if (file) {
      editSelectedImageFile = file;
      editRemoveImage = false;
      if (source !== 'input' && editImageInput) {
        editImageInput.value = '';
      }
    } else {
      editSelectedImageFile = null;
      if (source !== 'input' && editImageInput) {
        editImageInput.value = '';
      }
    }
    updateEditImageStatus();
    updateEditImageRemoveButton();
  }

  function applySiteName(name) {
    const siteName = name && name.trim() ? name.trim() : ADMIN_SITE_NAME_DEFAULT;
    currentSiteName = siteName;
    document.title = `${siteName}后台`;
    siteNameEls.forEach((el) => {
      el.textContent = siteName;
    });
    if (settingsSiteNameInput) {
      settingsSiteNameInput.value = siteName;
    }
  }

  function applyFontSettings(dateSize, textSize) {
    const root = document.documentElement;
    if (Number.isFinite(dateSize)) {
      currentDateFontSize = dateSize;
      root.style.setProperty('--quote-date-size', `${dateSize}px`);
      if (settingsDateFontInput) {
        settingsDateFontInput.value = dateSize;
      }
    }
    if (Number.isFinite(textSize)) {
      currentTextFontSize = textSize;
      root.style.setProperty('--quote-text-size', `${textSize}px`);
      if (settingsTextFontInput) {
        settingsTextFontInput.value = textSize;
      }
    }
  }

  applySiteName(ADMIN_SITE_NAME_DEFAULT);
  applyFontSettings(currentDateFontSize, currentTextFontSize);
  applyAdminPath(ADMIN_PATH_DEFAULT);

  function applyAdminPath(pathValue) {
    const value = pathValue && pathValue.trim() ? pathValue.trim() : ADMIN_PATH_DEFAULT;
    currentAdminPath = value;
    if (settingsAdminPathInput) {
      settingsAdminPathInput.value = value;
    }
  }

  function getAdminLoginUrl() {
    const base = currentAdminPath || ADMIN_PATH_DEFAULT;
    return `${base}/login`;
  }

  function redirectToAdminLogin() {
    window.location.href = getAdminLoginUrl();
  }

  function showToast(message, type) {
    if (!toastEl) return;
    toastEl.textContent = message || '';
    toastEl.classList.remove('toast-error', 'toast-success', 'toast-visible');
    if (type === 'success') {
      toastEl.classList.add('toast-success');
    } else {
      toastEl.classList.add('toast-error');
    }
    void toastEl.offsetWidth;
    toastEl.classList.add('toast-visible');
    setTimeout(() => {
      toastEl.classList.remove('toast-visible');
    }, 1800);
  }

  const deleteOverlay = document.getElementById('admin-delete-overlay');
  const deletePreview = document.getElementById('admin-delete-preview');
  const deleteError = document.getElementById('admin-delete-error');
  const deleteCloseBtn = document.getElementById('admin-delete-close');
  const deleteCancelBtn = document.getElementById('admin-delete-cancel');
  const deleteConfirmBtn = document.getElementById('admin-delete-confirm');
  let deletingItem = null;
  let deletingCard = null;

  function openDeleteOverlay(item, card) {
    deletingItem = item;
    deletingCard = card;
    if (deletePreview) {
      deletePreview.textContent = item.text || '';
    }
    if (deleteError) {
      deleteError.textContent = '';
    }
    if (!deleteOverlay) return;
    deleteOverlay.classList.remove('hidden');
    const raf = window.requestAnimationFrame || window.setTimeout;
    raf(() => {
      deleteOverlay.classList.add('modal-visible');
    }, 16);
  }

  function closeDeleteOverlay() {
    if (!deleteOverlay) return;
    deleteOverlay.classList.remove('modal-visible');
    setTimeout(() => {
      deleteOverlay.classList.add('hidden');
    }, 220);
    deletingItem = null;
    deletingCard = null;
    if (deleteError) {
      deleteError.textContent = '';
    }
  }

  async function confirmDelete() {
    if (!deletingItem || !deletingItem.id) return;
    try {
      const resp = await fetch(`/api/quotes/${encodeURIComponent(deletingItem.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          showToast('后台登录已失效，请刷新后重新登录。', 'error');
          closeDeleteOverlay();
          return;
        }
        if (deleteError) {
          deleteError.textContent = data.error || '删除失败';
        } else {
          showToast(data.error || '删除失败', 'error');
        }
        return;
      }
      if (deletingCard && deletingCard.parentNode) {
        deletingCard.parentNode.removeChild(deletingCard);
      }
      if (!quotesContainer.children.length) {
        emptyState.classList.remove('hidden');
      }
      showToast('已删除。', 'success');
      closeDeleteOverlay();
    } catch (err) {
      if (deleteError) {
        deleteError.textContent = '网络有点问题，稍后再试。';
      } else {
        showToast('网络有点问题，稍后再试。', 'error');
      }
    }
  }

  async function handleDelete(item, card) {
    openDeleteOverlay(item, card);
  }

  async function handleEdit(item, card) {
    editingItem = item;
    editingCard = card;
    if (editTextInput) {
      editTextInput.value = item.text || '';
    }
    if (editDateInput) {
      editDateInput.value = item.date || '';
    }
    if (editError) {
      editError.textContent = '';
    }
    resetEditImageState();
    openEditOverlay();
  }

  function renderQuote(item, append = true) {
    const card = document.createElement('article');
    card.className = 'quote-card';

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
      imgWrapper.appendChild(img);
      card.appendChild(imgWrapper);
    }

    const actions = document.createElement('div');
    actions.className = 'quote-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary-button delete-button';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', () => handleEdit(item, card));
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'secondary-button delete-button';
    deleteBtn.textContent = '删除';
    deleteBtn.style.marginLeft = '6px';
    deleteBtn.addEventListener('click', () => handleDelete(item, card));
    actions.appendChild(deleteBtn);

    card.appendChild(actions);

    if (append) {
      quotesContainer.appendChild(card);
    } else {
      quotesContainer.insertBefore(card, quotesContainer.firstChild);
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
      } else if (data.items && data.items.length) {
        emptyState.classList.add('hidden');
      }

      (data.items || []).forEach((item) => renderQuote(item, true));

      hasMore = !!data.hasMore;
      if (hasMore) {
        page += 1;
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
      listLoading.classList.add('hidden');
    }
  }

  function setupObserver() {
    if (!sentinel) return;
    observer = new IntersectionObserver(
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
  }

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    const value = searchInput.value || '';
    currentSearch = value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadQuotes({ reset: true });
    }, 300);
  });

  loadQuotes({ reset: true });
  setupObserver();
  fetchSettingsData();

  async function fetchSettingsData() {
    if (!settingsRequireCheckbox) return true;
    try {
      const resp = await fetch('/api/settings', {
        credentials: 'same-origin'
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          if (settingsError) {
            settingsError.textContent = '后台登录已失效，请重新登录。';
          }
          setTimeout(() => {
            redirectToAdminLogin();
          }, 800);
          return false;
        }
        if (settingsError) {
          settingsError.textContent = data.error || '加载设置失败。';
        } else {
          showToast(data.error || '加载设置失败。', 'error');
        }
        return false;
      }
      const data = await resp.json();
      if (settingsRequireCheckbox) {
        settingsRequireCheckbox.checked = data.requireUploadPassword !== false;
      }
      if (settingsRequireHomeCheckbox) {
        settingsRequireHomeCheckbox.checked = !!data.requireHomePassword;
      }
      applySiteName(data.siteName);
      applyAdminPath(data.adminPath);
      const dateSize = Number(data.dateFontSize);
      const textSize = Number(data.textFontSize);
      applyFontSettings(
        Number.isFinite(dateSize) ? dateSize : currentDateFontSize,
        Number.isFinite(textSize) ? textSize : currentTextFontSize
      );
      settingsLoaded = true;
      return true;
    } catch (err) {
      if (settingsError) {
        settingsError.textContent = '网络有点问题，稍后再试。';
      } else {
        showToast('网络有点问题，稍后再试。', 'error');
      }
      return false;
    }
  }

  if (editOverlay && editForm) {
    const closeEdit = () => {
      closeEditOverlay();
      editingItem = null;
      editingCard = null;
      resetEditImageState();
      if (editError) {
        editError.textContent = '';
      }
    };

    if (editCloseBtn) {
      editCloseBtn.addEventListener('click', closeEdit);
    }
    if (editCancelBtn) {
      editCancelBtn.addEventListener('click', closeEdit);
    }
    editOverlay.addEventListener('click', (e) => {
      if (e.target === editOverlay) {
        closeEdit();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !editOverlay.classList.contains('hidden')) {
        closeEdit();
      }
    });

    if (editImageInput) {
      editImageInput.addEventListener('change', () => {
        const file = editImageInput.files && editImageInput.files[0];
        setEditImageFile(file || null, 'input');
      });
    }

    if (editImageDropArea) {
      editImageDropArea.addEventListener('click', (e) => {
        if (!editImageInput) return;
        if (e.target === editImageDropArea || e.target === editImageStatus) {
          editImageInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach((eventName) => {
        editImageDropArea.addEventListener(eventName, (event) => {
          event.preventDefault();
          event.stopPropagation();
          editImageDropArea.classList.add('dragover');
        });
      });

      ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
        editImageDropArea.addEventListener(eventName, (event) => {
          event.preventDefault();
          event.stopPropagation();
          editImageDropArea.classList.remove('dragover');
        });
      });

      editImageDropArea.addEventListener('drop', (event) => {
        const dt = event.dataTransfer;
        if (!dt || !dt.files || !dt.files.length) return;
        const file = dt.files[0];
        setEditImageFile(file || null, 'drop');
      });
    }

    if (editImageRemoveBtn) {
      editImageRemoveBtn.addEventListener('click', () => {
        if (editingItem && editingItem.imageUrl) {
          editRemoveImage = !editRemoveImage;
        } else {
          editRemoveImage = false;
        }
        setEditImageFile(null, 'remove');
      });
    }

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!editingItem || !editingItem.id) {
        return;
      }
      const text = (editTextInput && editTextInput.value.trim()) || '';
      const date = (editDateInput && editDateInput.value) || '';
      if (!text) {
        if (editError) {
          editError.textContent = '语录内容不能为空。';
        }
        return;
      }
      if (!date) {
        if (editError) {
          editError.textContent = '日期不能为空。';
        }
        return;
      }

      const formData = new FormData();
      formData.append('text', text);
      formData.append('date', date);
      if (editSelectedImageFile) {
        formData.append('screenshot', editSelectedImageFile);
      } else if (editRemoveImage) {
        formData.append('removeImage', 'true');
      }

      try {
        const resp = await fetch(`/api/quotes/${encodeURIComponent(editingItem.id)}`, {
          method: 'PUT',
          credentials: 'same-origin',
          body: formData
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          if (resp.status === 401) {
            if (editError) {
              editError.textContent = '后台登录已失效，请重新登录。';
            }
            setTimeout(() => {
              redirectToAdminLogin();
            }, 800);
            return;
          }
          if (editError) {
            editError.textContent = data.error || '修改失败';
          }
          return;
        }
        const updated = await resp.json();
        const updatedItem = updated.item || updated;
        const updatedImageUrl = updatedItem.imageUrl || null;
        if (editingItem) {
          editingItem.text = updatedItem.text || text;
          editingItem.date = updatedItem.date || date;
          editingItem.imageUrl = updatedImageUrl;
        }
        if (editingCard) {
          const textEl = editingCard.querySelector('.quote-text');
          const dateEl = editingCard.querySelector('.quote-date');
          if (textEl) textEl.textContent = updatedItem.text || text;
          if (dateEl) dateEl.textContent = updatedItem.date || date;
          const existingWrapper = editingCard.querySelector('.quote-image-wrapper');
          if (updatedImageUrl) {
            if (existingWrapper) {
              const imgEl = existingWrapper.querySelector('img');
              if (imgEl) {
                imgEl.src = updatedImageUrl;
              }
            } else {
              const wrapper = document.createElement('div');
              wrapper.className = 'quote-image-wrapper';
              const img = document.createElement('img');
              img.className = 'quote-image';
              img.src = updatedImageUrl;
              img.alt = `${currentSiteName}截图`;
              wrapper.appendChild(img);
              const actions = editingCard.querySelector('.quote-actions');
              if (actions) {
                editingCard.insertBefore(wrapper, actions);
              } else {
                editingCard.appendChild(wrapper);
              }
            }
          } else if (existingWrapper && existingWrapper.parentNode) {
            existingWrapper.parentNode.removeChild(existingWrapper);
          }
        }
        closeEdit();
      } catch (err) {
        if (editError) {
          editError.textContent = '网络有点问题，稍后再试。';
        }
      }
    });
  }

  if (settingsBtn && settingsOverlay && settingsForm) {
    settingsBtn.addEventListener('click', async () => {
      if (settingsError) {
        settingsError.textContent = '';
      }
      if (settingsUploadPasswordInput) {
        settingsUploadPasswordInput.value = '';
      }
      if (settingsAdminPasswordInput) {
        settingsAdminPasswordInput.value = '';
      }
      openSettingsOverlay();
      const loaded = await fetchSettingsData();
      if (!loaded && settingsError) {
        settingsError.textContent = settingsError.textContent || '加载设置失败。';
      }
    });

    if (settingsCloseBtn) {
      settingsCloseBtn.addEventListener('click', closeSettingsOverlay);
    }
    if (settingsCancelBtn) {
      settingsCancelBtn.addEventListener('click', closeSettingsOverlay);
    }
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) {
        closeSettingsOverlay();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) {
        closeSettingsOverlay();
      }
    });

    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (settingsError) {
        settingsError.textContent = '';
      }
      const payload = {
        requireUploadPassword: settingsRequireCheckbox
          ? settingsRequireCheckbox.checked
          : true,
        requireHomePassword: settingsRequireHomeCheckbox
          ? settingsRequireHomeCheckbox.checked
          : false
      };
      const siteNameValue = settingsSiteNameInput && settingsSiteNameInput.value
        ? settingsSiteNameInput.value.trim()
        : '';
      const adminPathValue = settingsAdminPathInput && settingsAdminPathInput.value
        ? settingsAdminPathInput.value.trim()
        : '';
      const uploadPwdValue =
        settingsUploadPasswordInput && settingsUploadPasswordInput.value
          ? settingsUploadPasswordInput.value.trim()
          : '';
      const adminPwdValue =
        settingsAdminPasswordInput && settingsAdminPasswordInput.value
          ? settingsAdminPasswordInput.value.trim()
          : '';
      if (siteNameValue && siteNameValue !== currentSiteName) {
        payload.siteName = siteNameValue;
      }
      if (adminPathValue && adminPathValue !== currentAdminPath) {
        payload.adminPath = adminPathValue;
      }

      if (uploadPwdValue) {
        payload.uploadPassword = uploadPwdValue;
      }
      if (adminPwdValue) {
        payload.adminPassword = adminPwdValue;
      }
      const dateFontValue = settingsDateFontInput && settingsDateFontInput.value !== ''
        ? Number(settingsDateFontInput.value)
        : null;
      const textFontValue = settingsTextFontInput && settingsTextFontInput.value !== ''
        ? Number(settingsTextFontInput.value)
        : null;
      if (
        dateFontValue !== null &&
        Number.isFinite(dateFontValue) &&
        dateFontValue !== currentDateFontSize
      ) {
        payload.dateFontSize = dateFontValue;
      }
      if (
        textFontValue !== null &&
        Number.isFinite(textFontValue) &&
        textFontValue !== currentTextFontSize
      ) {
        payload.textFontSize = textFontValue;
      }

      try {
        const resp = await fetch('/api/settings', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          if (resp.status === 401) {
            if (settingsError) {
              settingsError.textContent = '后台登录已失效，请重新登录。';
            }
            setTimeout(() => {
              redirectToAdminLogin();
            }, 800);
            return;
          }
          if (settingsError) {
            settingsError.textContent = data.error || '保存失败。';
          } else {
            showToast(data.error || '保存失败。', 'error');
          }
          return;
        }
        await resp.json().catch(() => ({}));
        await fetchSettingsData();
        showToast('设置已更新。', 'success');
        closeSettingsOverlay();
      } catch (err) {
        if (settingsError) {
          settingsError.textContent = '网络有点问题，稍后再试。';
        } else {
          showToast('网络有点问题，稍后再试。', 'error');
        }
      }
    });
  }

  if (deleteOverlay) {
    if (deleteCloseBtn) {
      deleteCloseBtn.addEventListener('click', closeDeleteOverlay);
    }
    if (deleteCancelBtn) {
      deleteCancelBtn.addEventListener('click', closeDeleteOverlay);
    }
    if (deleteConfirmBtn) {
      deleteConfirmBtn.addEventListener('click', confirmDelete);
    }
    deleteOverlay.addEventListener('click', (e) => {
      if (e.target === deleteOverlay) {
        closeDeleteOverlay();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !deleteOverlay.classList.contains('hidden')) {
        closeDeleteOverlay();
      }
    });
  }
})();
