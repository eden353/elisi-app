(() => {
  const API_BASE_URL = 'https://api.vectorengine.ai';
  let API_KEY = '';
  const API_MODEL = 'gemini-2.5-pro';

  // --- Touch-scroll guard: prevent accidental taps while scrolling ---
  const TOUCH_MOVE_THRESHOLD = 10; // px
  let _touchStartX = 0;
  let _touchStartY = 0;
  let _touchMoved = false;

  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    _touchStartX = t.clientX;
    _touchStartY = t.clientY;
    _touchMoved = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (_touchMoved) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - _touchStartX);
    const dy = Math.abs(t.clientY - _touchStartY);
    if (dx > TOUCH_MOVE_THRESHOLD || dy > TOUCH_MOVE_THRESHOLD) {
      _touchMoved = true;
    }
  }, { passive: true });

  /** Wrap a click handler to only fire when the touch didn't scroll */
  function safeTap(handler) {
    return function (e) {
      if (_touchMoved) return;
      handler.call(this, e);
    };
  }

  const SYSTEM_PROMPT = `You are Elisi, a friendly and helpful AI life management assistant. You help users with:
- Task management and formulation
- Schedule planning
- Recording inspiration and ideas
- Building good habits

Keep responses concise, warm, and actionable. Use occasional emojis to stay friendly.
Respond naturally in the same language the user uses. Follow the user's language preference.

CRITICAL RULES:
- NEVER include thinking process, reasoning, or explanations in your response.
- NEVER wrap JSON in markdown code blocks (no \`\`\`json or \`\`\`).
- When a JSON response is required, output ONLY the raw JSON object, nothing else before or after it.
- Do NOT add any text outside the JSON when a structured response is needed.

When the user asks about today's plans, schedule, or tasks (e.g. "What plans do we have for today?", "今天有什么安排", "今日任务"), respond with ONLY this JSON:
{"type":"schedule_card","introText":"A brief friendly intro","title":"Today's schedule","summary":"Brief summary","tasks":[{"name":"Task","time":"09:00","done":false}],"notes":[{"content":"Note"}]}
Generate 2-4 tasks and 0-2 notes.

When the user asks about this week's plans, weekly schedule, weekly tasks (e.g. "What's the plan for this week?", "本周有什么任务", "查看本周计划", "这周安排"), respond with ONLY this JSON:
{"type":"planner_card","introText":"A brief friendly intro","tasks":[{"name":"Task name"}]}
Generate 2-4 weekly tasks.

When the user wants to create a note or record something (e.g. "记录一下", "创建笔记", "帮我记一下"), DO NOT generate JSON immediately. Instead, reply naturally to ask what they want to record. For example: "好的，你想记录什么内容呢？😊"
Then, when the user provides the actual note content in their next message, generate ONLY this JSON:
{"type":"note_card","introText":"A brief friendly message confirming the note was created","title":"Short title under 30 chars","content":"The full note content"}
If the user provides both the intent and content together in one message (e.g. "帮我记一下明天要买牛奶"), generate the note_card JSON directly without asking.
If the user sends an image and asks to create a note from it, describe the image content and generate the note_card JSON with the description as the content.

When the user asks to modify/update the most recently created note (e.g. "把标题改成xxx", "内容改成xxx", "change the title", "update the content"), respond with ONLY this JSON:
{"type":"note_update","introText":"A brief confirmation message","title":"optional new title","content":"optional new content"}
Only include the "title" and/or "content" fields that need to change.

When the user asks about their note count, how many notes they have, or wants to check their notes (e.g. "我有多少笔记", "查看笔记数量", "how many notes do I have", "check my notes"), respond with ONLY this JSON:
{"type":"note_count_card","introText":"A friendly response about their note count and a follow-up question guiding them to view or manage notes, e.g. asking if they want to view specific content or manage some notes"}

For all other conversations, respond naturally as a friendly assistant. Do NOT output JSON for general chat. Maintain conversation context and respond naturally based on the ongoing dialogue.`;

  // DOM elements
  const mainContent = document.querySelector('.main-content');
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatMicBtn = document.getElementById('chatMicBtn');
  const chatImgBtn = document.getElementById('chatImgBtn');
  const chatImgInput = document.getElementById('chatImgInput');
  const chatInputImages = document.getElementById('chatInputImages');
  const chatInputActions = document.getElementById('chatInputActions');
  const chatMessages = document.getElementById('chatMessages');
  const chatToolBtn = document.getElementById('chatToolBtn');
  const apiModal = document.getElementById('apiModal');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiSaveBtn = document.getElementById('apiSaveBtn');
  const apiCancelBtn = document.getElementById('apiCancelBtn');

  let conversationHistory = [];
  let isTyping = false;
  let chatUploadedImages = [];
  let lastChatImages = [];

  const chatInputBox = document.getElementById('chatInputWrapper');

  // --- Chat input state management ---
  // State 1 (Inactive): bg #F5F5F5, no border, pic+voice visible, send hidden, tool btn visible
  // State 2 (Active/typing): bg #FFF, border, pic+send visible, voice hidden, tool btn hidden
  // State 3 (Multiline): same as active + border-radius 30 + auto-height
  // State 4 (Image only): pic+voice+send visible, can send without text

  function updateChatInputState() {
    const hasText = chatInput.value.trim().length > 0;
    const hasImages = chatUploadedImages.length > 0;

    // Auto-resize textarea
    chatInput.style.height = 'auto';
    const singleLineHeight = 34;
    const maxInputHeight = 140;
    const newHeight = Math.min(chatInput.scrollHeight, maxInputHeight);
    chatInput.style.height = newHeight + 'px';
    chatInput.style.overflowY = chatInput.scrollHeight > maxInputHeight ? 'auto' : 'hidden';

    // Multiline detection
    if (newHeight > singleLineHeight) {
      chatInputBox.classList.add('multiline');
    } else {
      chatInputBox.classList.remove('multiline');
    }

    if (hasText) {
      // State 2/3: typing - show send, hide voice
      chatMicBtn.classList.add('hidden');
      chatSendBtn.classList.remove('hidden');
      chatInputBox.classList.add('has-text');
    } else if (hasImages && !hasText) {
      // State 4: image only - show voice + send
      chatMicBtn.classList.remove('hidden');
      chatSendBtn.classList.remove('hidden');
      chatInputBox.classList.remove('has-text');
    } else {
      // State 1: inactive or focused empty - show voice, hide send
      chatMicBtn.classList.remove('hidden');
      chatSendBtn.classList.add('hidden');
      chatInputBox.classList.remove('has-text');
    }
  }

  // Focus: activate input, hide tool button
  chatInput.addEventListener('focus', () => {
    chatInputBox.classList.add('active');
    chatToolBtn.classList.add('hidden');
    updateChatInputState();
  });

  // Blur: deactivate if empty and no images
  chatInput.addEventListener('blur', () => {
    setTimeout(() => {
      const hasText = chatInput.value.trim().length > 0;
      const hasImages = chatUploadedImages.length > 0;
      if (!hasText && !hasImages) {
        chatInputBox.classList.remove('active');
        chatToolBtn.classList.remove('hidden');
      }
    }, 150);
  });

  chatInput.addEventListener('input', () => {
    updateChatInputState();
  });

  // --- Chat image upload ---
  chatImgBtn.addEventListener('click', () => {
    chatImgInput.click();
  });

  chatImgInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        chatUploadedImages.push(ev.target.result);
        renderChatImagePreviews();
        updateChatInputState();
        // Activate input state when images are added
        chatInputBox.classList.add('active');
        chatToolBtn.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });
    chatImgInput.value = '';
  });

  function renderChatImagePreviews() {
    chatInputImages.innerHTML = '';
    if (chatUploadedImages.length === 0) {
      chatInputImages.classList.remove('has-images');
      return;
    }
    chatInputImages.classList.add('has-images');
    chatUploadedImages.forEach((src, idx) => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.innerHTML = `<img src="${src}" class="preview-thumb"><button class="preview-remove" data-idx="${idx}">&times;</button>`;
      chatInputImages.appendChild(item);
    });
    chatInputImages.querySelectorAll('.preview-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        chatUploadedImages.splice(idx, 1);
        renderChatImagePreviews();
        updateChatInputState();
        if (chatUploadedImages.length === 0 && !chatInput.value.trim()) {
          chatInputBox.classList.remove('active');
          chatToolBtn.classList.remove('hidden');
        }
      });
    });
  }

  function resetChatInput() {
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatUploadedImages = [];
    renderChatImagePreviews();
    chatSendBtn.classList.add('hidden');
    chatMicBtn.classList.remove('hidden');
    chatInputBox.classList.remove('multiline');
    chatInputBox.classList.remove('active');
    chatInputBox.classList.remove('has-text');
    chatToolBtn.classList.remove('hidden');
  }

  // --- Send Message ---
  chatSendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  function sendMessage() {
    const text = chatInput.value.trim();
    const hasImages = chatUploadedImages.length > 0;
    if ((!text && !hasImages) || isTyping) return;

    // Show user message with images if any
    if (hasImages) {
      const userMsg = appendMessage(text || '(image)', 'user');
      const bubble = userMsg.querySelector('.message-bubble');
      if (text) bubble.textContent = text;
      else bubble.textContent = '';
      chatUploadedImages.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'max-width:200px;border-radius:8px;margin-top:4px;display:block';
        bubble.appendChild(img);
      });
    } else {
      appendMessage(text, 'user');
    }

    // Build multimodal content if images are present
    const images = [...chatUploadedImages];
    resetChatInput();

    // Store images for potential note_card creation by AI
    lastChatImages = images;

    if (images.length > 0) {
      const contentParts = [];
      images.forEach(src => {
        const match = src.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: src }
          });
        }
      });
      if (text) {
        contentParts.push({ type: 'text', text });
      } else {
        contentParts.push({ type: 'text', text: 'Please describe what you see in this image.' });
      }
      conversationHistory.push({ role: 'user', content: contentParts });
    } else {
      conversationHistory.push({ role: 'user', content: text });
    }

    showTypingIndicator();
    callApi();
  }

  function appendMessage(text, sender) {
    const msgEl = document.createElement('div');
    msgEl.className = `chat-message ${sender}-message`;

    if (sender === 'ai') {
      msgEl.innerHTML = `
        <div class="message-avatar">
          <img src="logo for talk.svg" width="40" height="40" alt="Elisi">
        </div>
        <div class="message-bubble"></div>
      `;
    } else {
      msgEl.innerHTML = `<div class="message-bubble"></div>`;
    }

    msgEl.querySelector('.message-bubble').textContent = text;
    chatMessages.appendChild(msgEl);
    scrollToChat(msgEl);
    return msgEl;
  }

  let isFirstMessage = true;

  function scrollToChat(targetEl) {
    requestAnimationFrame(() => {
      if (isFirstMessage && targetEl) {
        // First message: scroll so the message appears right at the top
        const targetTop = targetEl.offsetTop - chatMessages.offsetTop + chatMessages.parentElement.offsetTop;
        mainContent.scrollTo({
          top: targetTop,
          behavior: 'smooth'
        });
        isFirstMessage = false;
      } else {
        // Subsequent messages: scroll to bottom
        mainContent.scrollTo({
          top: mainContent.scrollHeight,
          behavior: 'smooth'
        });
      }
    });
  }

  function showTypingIndicator() {
    isTyping = true;
    const indicator = document.createElement('div');
    indicator.className = 'chat-message ai-message typing-indicator';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
      <div class="message-avatar">
        <img src="logo for talk.svg" width="40" height="40" alt="Elisi">
      </div>
      <div class="message-bubble">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    chatMessages.appendChild(indicator);
    scrollToChat(indicator);
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
    isTyping = false;
  }

  // --- Typewriter effect ---
  function typewriterEffect(element, text, speed = 18) {
    let i = 0;
    element.textContent = '';
    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        scrollToChat();
        setTimeout(type, speed);
      }
    }
    type();
  }

  // --- Gemini API ---
  // (moved to bottom with schedule card support)

  // --- API Key Management ---
  function showApiModal() {
    apiKeyInput.value = '';
    apiModal.classList.add('active');
    setTimeout(() => apiKeyInput.focus(), 100);
  }

  apiSaveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      API_KEY = key;
      apiModal.classList.remove('active');
      // Retry sending if there was a pending message
      const lastUserMsg = conversationHistory[conversationHistory.length - 1];
      if (lastUserMsg?.role === 'user') {
        showTypingIndicator();
        callApi();
      }
    }
  });

  apiCancelBtn.addEventListener('click', () => {
    if (!API_KEY) return; // Prevent closing without entering a key
    apiModal.classList.remove('active');
  });

  // Long-press on Elisi logo to change API key
  const logo = document.querySelector('.elisi-logo');
  let pressTimer;
  logo.addEventListener('mousedown', () => {
    pressTimer = setTimeout(showApiModal, 800);
  });
  logo.addEventListener('mouseup', () => clearTimeout(pressTimer));
  logo.addEventListener('mouseleave', () => clearTimeout(pressTimer));

  // Auto show API key modal if not set
  if (!API_KEY) {
    showApiModal();
  }
  logo.addEventListener('touchstart', () => {
    pressTimer = setTimeout(showApiModal, 800);
  });
  logo.addEventListener('touchend', () => clearTimeout(pressTimer));

  // --- Task Detail Panel ---
  const taskDetailMask = document.getElementById('taskDetailMask');
  const taskDetailPanel = document.getElementById('taskDetailPanel');
  const taskDetailTitle = document.getElementById('taskDetailTitle');
  const taskDetailProject = document.getElementById('taskDetailProject');
  const taskDetailProjectDot = document.getElementById('taskDetailProjectDot');
  const taskDetailSubtaskList = document.getElementById('taskDetailSubtaskList');
  const subtaskAddInput = document.getElementById('subtaskAddInput');

  let currentTaskData = null;
  let currentDetailType = 'task'; // 'task' or 'note'

  function openTaskDetail(taskData) {
    currentTaskData = taskData;
    currentDetailType = 'task';

    // Set header title
    document.querySelector('.task-detail-header-title').textContent = 'Task Details';
    // Show task-specific sections
    document.querySelector('.task-detail-subtask-section').style.display = '';
    document.querySelector('.task-detail-title-icon').innerHTML = '<img src="icon-clipboard.svg" alt="clipboard" width="20" height="20">';
    // Remove note content area if exists
    const existingNoteArea = document.querySelector('.note-detail-content-area');
    if (existingNoteArea) existingNoteArea.remove();
    // Show project row dot
    taskDetailProjectDot.style.display = '';

    // Populate panel
    if (taskData.title) {
      taskDetailTitle.textContent = taskData.title;
    } else {
      taskDetailTitle.innerHTML = '';
    }
    taskDetailProject.textContent = taskData.project || '';
    taskDetailProjectDot.style.borderColor = 'rgba(162,157,151,0.6)';

    // Clear existing subtasks (keep the add input)
    const addItem = taskDetailSubtaskList.querySelector('.add-subtask-item');
    taskDetailSubtaskList.innerHTML = '';
    if (addItem) taskDetailSubtaskList.appendChild(addItem);

    // Add subtasks after the add input
    if (taskData.subtasks) {
      taskData.subtasks.forEach((sub, idx) => {
        const item = createSubtaskItem(sub, idx);
        taskDetailSubtaskList.appendChild(item);
      });
    }

    // Show panel
    taskDetailMask.classList.add('active');
    taskDetailPanel.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function openNoteDetail(noteData) {
    currentTaskData = noteData;
    currentDetailType = 'note';

    // Set header title
    document.querySelector('.task-detail-header-title').textContent = 'Note Details';
    // Hide task-specific sections
    document.querySelector('.task-detail-subtask-section').style.display = 'none';
    // Hide title icon
    document.querySelector('.task-detail-title-icon').style.display = 'none';
    // Hide project row
    document.querySelector('.task-detail-project-row').style.display = 'none';

    // Set note title in title area (styled as 20px/590 weight)
    taskDetailTitle.textContent = noteData.title || '';
    taskDetailTitle.classList.add('note-detail-title');
    taskDetailTitle.contentEditable = 'true';
    taskDetailTitle.addEventListener('input', function noteDetailTitleInput() {
      if (currentTaskData) {
        currentTaskData.title = taskDetailTitle.textContent;
      }
    });

    // Remove existing note content area
    const existingNoteArea = document.querySelector('.note-detail-content-area');
    if (existingNoteArea) existingNoteArea.remove();

    // Build images list: prefer images array, fallback to single image
    const allImages = noteData.images ? [...noteData.images] : (noteData.detailImage || noteData.image ? [noteData.detailImage || noteData.image] : []);

    // Add note content area after title section: body text + images + bottom line
    const titleSection = document.querySelector('.task-detail-title-section');
    const noteArea = document.createElement('div');
    noteArea.className = 'note-detail-content-area';
    noteArea.innerHTML = `
      <div class="note-detail-body-text" contenteditable="true" placeholder="Write your note...">${escapeHtml(noteData.content || '')}</div>
      <div class="note-detail-images"></div>
      <div class="note-detail-bottom-line"></div>
    `;
    titleSection.after(noteArea);

    const imagesContainer = noteArea.querySelector('.note-detail-images');

    function renderDetailImages() {
      imagesContainer.innerHTML = '';
      allImages.forEach((src, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'note-detail-image-wrapper';
        wrapper.innerHTML = `<img class="note-detail-image" src="${src}" alt=""><button class="note-detail-image-delete">&times;</button>`;
        wrapper.querySelector('.note-detail-image-delete').addEventListener('click', () => {
          allImages.splice(idx, 1);
          syncImagesToNoteData();
          renderDetailImages();
        });
        imagesContainer.appendChild(wrapper);
      });
    }

    function syncImagesToNoteData() {
      if (!currentTaskData) return;
      if (allImages.length > 0) {
        currentTaskData.images = [...allImages];
        currentTaskData.image = allImages[0];
        currentTaskData.detailImage = allImages[0];
      } else {
        currentTaskData.images = null;
        currentTaskData.image = null;
        currentTaskData.detailImage = null;
      }
    }

    renderDetailImages();

    // Update content on change
    const bodyText = noteArea.querySelector('.note-detail-body-text');
    bodyText.addEventListener('input', () => {
      if (currentTaskData) {
        currentTaskData.content = bodyText.textContent;
      }
    });

    // Show panel
    taskDetailMask.classList.add('active');
    taskDetailPanel.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeTaskDetail() {
    taskDetailPanel.classList.remove('active');
    taskDetailMask.classList.remove('active');
    document.body.style.overflow = '';
    taskDetailTitle.contentEditable = 'false';
    // Reset more section
    moreExpanded = false;
    taskDetailMoreContent.classList.add('hidden');
    taskDetailMoreBtn.style.transform = '';
    // Clean up note content area
    const noteArea = document.querySelector('.note-detail-content-area');
    if (noteArea) noteArea.remove();
    // Reset note-specific styles
    if (currentDetailType === 'note') {
      document.querySelector('.task-detail-title-icon').style.display = '';
      document.querySelector('.task-detail-project-row').style.display = '';
      taskDetailTitle.classList.remove('note-detail-title');
      // Refresh all visible note cards to reflect edits
      refreshNoteCards();
    }
    currentDetailType = 'task';
  }

  function refreshNoteCards() {
    document.querySelectorAll('.note-card-item').forEach(card => {
      const noteData = card._noteData;
      if (!noteData) return;
      // Rebuild card with updated data
      const newCard = createNoteCardElement(noteData);
      card.parentNode.replaceChild(newCard, card);
    });
  }

  function createSubtaskItem(sub, idx) {
    const item = document.createElement('div');
    item.className = 'task-detail-subtask-item';
    item.innerHTML = `
      <span class="subtask-text${sub.done ? ' checked' : ''}">${escapeHtml(sub.name)}</span>
      <div class="subtask-checkbox${sub.done ? ' checked' : ''}" data-idx="${idx}"></div>
    `;
    // Toggle checkbox
    const checkbox = item.querySelector('.subtask-checkbox');
    const text = item.querySelector('.subtask-text');
    checkbox.addEventListener('click', () => {
      const isDone = checkbox.classList.toggle('checked');
      text.classList.toggle('checked', isDone);
      if (currentTaskData && currentTaskData.subtasks[idx]) {
        currentTaskData.subtasks[idx].done = isDone;
      }
    });
    return item;
  }

  // Close handlers
  taskDetailMask.addEventListener('click', closeTaskDetail);

  // Title editable on click
  taskDetailTitle.addEventListener('click', () => {
    taskDetailTitle.contentEditable = 'true';
    taskDetailTitle.focus();
    const range = document.createRange();
    range.selectNodeContents(taskDetailTitle);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  taskDetailTitle.addEventListener('blur', () => {
    taskDetailTitle.contentEditable = 'false';
    // Clean up empty content so :empty pseudo-class works
    if (!taskDetailTitle.textContent.trim()) {
      taskDetailTitle.innerHTML = '';
    }
    if (currentTaskData) {
      currentTaskData.title = taskDetailTitle.textContent.trim();
    }
  });

  // Project name editable on click
  taskDetailProject.addEventListener('click', () => {
    taskDetailProject.contentEditable = 'true';
    taskDetailProject.focus();
    const range = document.createRange();
    range.selectNodeContents(taskDetailProject);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  taskDetailProject.addEventListener('blur', () => {
    taskDetailProject.contentEditable = 'false';
    if (currentTaskData) {
      currentTaskData.project = taskDetailProject.textContent.trim();
    }
  });

  // Add subtask via input
  subtaskAddInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = subtaskAddInput.value.trim();
      if (!text) return;
      const sub = { name: text, done: false };
      if (currentTaskData) {
        if (!currentTaskData.subtasks) currentTaskData.subtasks = [];
        currentTaskData.subtasks.push(sub);
      }
      const addItem = taskDetailSubtaskList.querySelector('.add-subtask-item');
      const idx = currentTaskData ? currentTaskData.subtasks.length - 1 : 0;
      const item = createSubtaskItem(sub, idx);
      taskDetailSubtaskList.appendChild(item);
      subtaskAddInput.value = '';
    }
  });

  // --- More content toggle ---
  const taskDetailMoreBtn = document.getElementById('taskDetailMoreBtn');
  const taskDetailMoreContent = document.getElementById('taskDetailMoreContent');
  let moreExpanded = false;

  taskDetailMoreBtn.addEventListener('click', () => {
    moreExpanded = !moreExpanded;
    taskDetailMoreContent.classList.toggle('hidden', !moreExpanded);
    taskDetailMoreBtn.style.transform = moreExpanded ? 'rotate(180deg)' : '';
  });

  // --- Drag to dismiss ---
  let dragStartY = 0;
  let dragCurrentY = 0;
  let isDragging = false;

  const dragHandle = taskDetailPanel.querySelector('.task-detail-drag-handle');

  function onDragStart(e) {
    const touch = e.touches ? e.touches[0] : e;
    dragStartY = touch.clientY;
    dragCurrentY = dragStartY;
    isDragging = true;
    taskDetailPanel.classList.add('dragging');
  }

  function onDragMove(e) {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    dragCurrentY = touch.clientY;
    const dy = Math.max(0, dragCurrentY - dragStartY);
    taskDetailPanel.style.transform = `translateY(${dy}px)`;
    // Fade mask
    const progress = Math.min(dy / 300, 1);
    taskDetailMask.style.opacity = 1 - progress * 0.6;
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;
    taskDetailPanel.classList.remove('dragging');
    taskDetailPanel.style.transform = '';
    taskDetailMask.style.opacity = '';

    const dy = dragCurrentY - dragStartY;
    if (dy > 120) {
      closeTaskDetail();
    } else {
      taskDetailPanel.classList.add('active');
    }
  }

  dragHandle.addEventListener('touchstart', onDragStart, { passive: true });
  dragHandle.addEventListener('mousedown', onDragStart);
  document.addEventListener('touchmove', onDragMove, { passive: true });
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchend', onDragEnd);
  document.addEventListener('mouseup', onDragEnd);

  // --- Goal Card Quick Action ---
  const goalCards = document.querySelectorAll('.goal-card');
  if (goalCards[0]) {
    goalCards[0].addEventListener('click', safeTap(() => {
      sendQuickAction('What\'s the plan for this week?');
    }));
  }
  if (goalCards[1]) {
    goalCards[1].addEventListener('click', safeTap(() => {
      sendQuickAction('What plans do we have for today?');
    }));
  }

  function sendQuickAction(text) {
    if (isTyping) return;

    // Append user message with quick-action style
    appendQuickActionMessage(text);

    // Call API for real response
    conversationHistory.push({ role: 'user', content: text });
    showTypingIndicator();
    callApi();
  }

  function appendQuickActionMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message user-message quick-action-message';
    msgEl.innerHTML = `<div class="message-bubble quick-action-bubble"></div>`;
    msgEl.querySelector('.quick-action-bubble').textContent = text;
    chatMessages.appendChild(msgEl);
    scrollToChat(msgEl);
  }

  // --- Schedule Card Rendering ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderScheduleCard(data) {
    const now = new Date();
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dayName = dayNames[now.getDay()];
    const dateNum = now.getDate();
    const taskCount = data.tasks ? data.tasks.length : 0;
    const noteCount = data.notes ? data.notes.length : 0;

    const introHtml = data.introText
      ? `<div class="card-intro-bubble"><div class="message-bubble">${escapeHtml(data.introText)}</div></div>`
      : '';

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message ai-message schedule-card-message';

    msgEl.innerHTML = `
      <div class="schedule-card-label-row">
        <div class="message-avatar">
          <img src="logo for talk.svg" width="40" height="40" alt="Elisi">
        </div>
        <div class="ai-label">Elisi</div>
      </div>
      ${introHtml}
      <div class="schedule-card-container">
        <div class="schedule-card-collapsed">
          <div class="schedule-card">
            <div class="schedule-card-inner">
              <h3 class="schedule-title">${escapeHtml(data.title || "Today's schedule")}</h3>
              <p class="schedule-summary">${escapeHtml(data.summary || '')}</p>
              <div class="schedule-footer">
                <span class="schedule-stats">${taskCount} tasks  ${noteCount} notes</span>
                <div class="schedule-date-badge">
                  <span class="schedule-day">${dayName}</span>
                  <span class="schedule-date">${dateNum}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="schedule-card-expanded hidden">
          <div class="expanded-card task-card-large">
            <div class="expanded-card-header">
              <div class="expanded-card-title-row">
                <span class="task-color-bar" style="background:#146BF2"></span>
                <span class="expanded-card-title">👨‍💻 Vibe Coding</span>
              </div>
              <div class="task-checkbox"></div>
            </div>
            <p class="expanded-card-desc">Complete The UI Design For The Core Page</p>
            <div class="expanded-card-reminder">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1.5C5.7 1.5 3 4.2 3 7.5V11L1.5 13.5H16.5L15 11V7.5C15 4.2 12.3 1.5 9 1.5Z" fill="rgba(162,157,151,0.8)"/><path d="M7.5 15C7.5 15.8 8.2 16.5 9 16.5S10.5 15.8 10.5 15" fill="rgba(162,157,151,0.8)"/></svg>
              <span class="reminder-time">23:02</span>
            </div>
          </div>
          <div class="expanded-card task-card-small">
            <div class="expanded-card-header">
              <div class="expanded-card-title-row">
                <span class="task-color-bar" style="background:#2DC276"></span>
                <span class="expanded-card-title">🚴🏻 Cycling Workout</span>
              </div>
              <div class="task-checkbox"></div>
            </div>
          </div>
          <div class="expanded-card note-card">
            <div class="note-card-image"></div>
            <div class="note-card-content">
              <span class="expanded-card-title">Today's Insight</span>
              <p class="note-card-text">The reason for our happiness lies with in ourselves, not outside of ourselves.</p>
            </div>
          </div>
          <button class="collapse-btn">
            <span>Collapse</span>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 5L5 1L9 5" stroke="rgba(0,0,0,0.54)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `;

    // Click stacked card to expand
    const collapsed = msgEl.querySelector('.schedule-card-collapsed');
    const expanded = msgEl.querySelector('.schedule-card-expanded');

    function expandCards() {
      collapsed.classList.add('hidden');
      expanded.classList.remove('hidden');
      // Force re-trigger animations
      expanded.classList.remove('animate-in');
      void expanded.offsetWidth; // reflow
      expanded.classList.add('animate-in');
      scrollToChat(msgEl);
    }

    function collapseCardsHandler() {
      expanded.classList.remove('animate-in');
      expanded.classList.add('hidden');
      collapsed.classList.remove('hidden');
      scrollToChat(msgEl);
    }

    collapsed.addEventListener('click', safeTap(expandCards));
    msgEl.querySelector('.collapse-btn').addEventListener('click', safeTap(collapseCardsHandler));

    // Click expanded task cards to open detail panel
    const expandedCards = msgEl.querySelectorAll('.expanded-card.task-card-large, .expanded-card.task-card-small');
    expandedCards.forEach((card) => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', safeTap((e) => {
        e.stopPropagation();
        const titleEl = card.querySelector('.expanded-card-title');
        const descEl = card.querySelector('.expanded-card-desc');
        const colorBar = card.querySelector('.task-color-bar');
        const taskTitle = titleEl ? titleEl.textContent.trim() : 'Untitled';
        const taskDesc = descEl ? descEl.textContent.trim() : '';
        openTaskDetail({
          title: taskDesc,
          project: titleEl ? titleEl.textContent.trim() : '',
          color: colorBar ? colorBar.style.background : '#E9DFD1',
          subtasks: []
        });
      }));
    });

    chatMessages.appendChild(msgEl);
    scrollToChat(msgEl);
    return msgEl;
  }

  // --- Planner Card Rendering ---
  function renderPlannerCard(data) {
    const now = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const colors = ['#146BF2', '#04C747', '#29ADFF', '#FF6B35', '#9B59B6'];
    let weekOffset = 0;
    let selectedDayIndex = now.getDay(); // default to today

    // Pre-built tasks per day-of-week (0=Sun..6=Sat)
    const dailyTasks = {
      0: [],
      1: [
        { name: '\u{1F468}\u200D\u{1F4BB} Vibe Coding', color: '#146BF2',
          subtasks: [{ name: 'Complete homepage layout', done: false }, { name: 'Fix responsive issues', done: false }] },
        { name: 'Weekly meeting', color: '#29ADFF',
          subtasks: [{ name: 'Prepare meeting agenda', done: true }, { name: 'Share progress report', done: false }] }
      ],
      2: [
        { name: '\u{1F6B4}\u{1F3FB} Cycling workout', color: '#04C747',
          subtasks: [{ name: 'Warm up 10 min', done: false }, { name: '30 min ride', done: false }, { name: 'Cool down stretch', done: false }] }
      ],
      3: [
        { name: '\u{1F468}\u200D\u{1F4BB} Vibe Coding', color: '#146BF2',
          subtasks: [{ name: 'Implement API integration', done: false }, { name: 'Write unit tests', done: false }] },
        { name: '\u{1F6B4}\u{1F3FB} Cycling workout', color: '#04C747',
          subtasks: [] },
        { name: 'Weekly meeting', color: '#29ADFF',
          subtasks: [{ name: 'Review sprint backlog', done: false }] }
      ],
      4: [
        { name: 'Read Chapter 3-5', color: '#FF6B35',
          subtasks: [{ name: 'Take notes on key concepts', done: false }, { name: 'Summarize main ideas', done: false }] }
      ],
      5: [
        { name: '\u{1F468}\u200D\u{1F4BB} Vibe Coding', color: '#146BF2',
          subtasks: [{ name: 'Code review', done: false }, { name: 'Deploy to staging', done: false }] },
        { name: 'Practice English listening', color: '#9B59B6',
          subtasks: [{ name: 'Listen to podcast ep.12', done: false }, { name: 'Complete exercises', done: false }] }
      ],
      6: []
    };

    // Use data.tasks for current week's today if provided
    if (data.tasks && data.tasks.length) {
      dailyTasks[now.getDay()] = data.tasks.map((t, i) => ({
        name: t.name,
        color: colors[i % colors.length]
      }));
    }

    function getWeekStart(offset) {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay() + offset * 7);
      return d;
    }

    function getWeekNum(startDate) {
      const yearStart = new Date(startDate.getFullYear(), 0, 1);
      return Math.ceil(((startDate - yearStart) / 86400000 + 1) / 7);
    }

    function buildDaysHtml(offset) {
      const start = getWeekStart(offset);
      let html = '';
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const isToday = d.toDateString() === now.toDateString();
        const isSelected = (i === selectedDayIndex);
        const isWeekend = i === 0 || i === 6;
        let numClass = 'planner-day-num';
        if (isWeekend) numClass += ' weekend';
        if (isSelected) numClass += ' today';
        html += `
          <div class="planner-day-col" data-day="${i}">
            <span class="planner-day-name${isWeekend ? ' weekend' : ''}">${dayNames[i]}</span>
            <div class="${numClass}">${d.getDate()}</div>
          </div>`;
      }
      return html;
    }

    function buildTasksHtml(dayIndex) {
      const tasks = dailyTasks[dayIndex] || [];
      if (tasks.length === 0) return '<div class="planner-empty-text">No tasks for this day</div>';
      let html = '';
      tasks.forEach((t, i) => {
        html += `
          <div class="planner-task-item" data-day="${dayIndex}" data-task="${i}">
            <div class="planner-task-color" style="background:${t.color}"></div>
            <span class="planner-task-name">${escapeHtml(t.name)}</span>
            <div class="planner-task-check"></div>
          </div>`;
      });
      return html;
    }

    function bindTaskClicks() {
      taskListContainer.querySelectorAll('.planner-task-item').forEach((item) => {
        item.style.cursor = 'pointer';
        item.addEventListener('click', safeTap(() => {
          const dayIdx = parseInt(item.dataset.day);
          const taskIdx = parseInt(item.dataset.task);
          const task = dailyTasks[dayIdx]?.[taskIdx];
          if (!task) return;
          openTaskDetail({
            title: '',
            project: task.name,
            color: task.color,
            subtasks: task.subtasks ? task.subtasks.map(s => ({ ...s })) : []
          });
        }));
      });
    }

    function updateDisplay() {
      const start = getWeekStart(weekOffset);
      weekNumEl.textContent = getWeekNum(start);
      daysContainer.innerHTML = buildDaysHtml(weekOffset);
      taskListContainer.innerHTML = buildTasksHtml(selectedDayIndex);
      bindDayClicks();
      bindTaskClicks();
    }

    function bindDayClicks() {
      daysContainer.querySelectorAll('.planner-day-col').forEach((col) => {
        col.style.cursor = 'pointer';
        col.addEventListener('click', safeTap(() => {
          selectedDayIndex = parseInt(col.dataset.day);
          updateDisplay();
        }));
      });
    }

    const weekNum = getWeekNum(getWeekStart(0));
    const introHtml = data.introText
      ? `<div class="card-intro-bubble"><div class="message-bubble">${escapeHtml(data.introText)}</div></div>`
      : '';

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message ai-message planner-card-message';
    msgEl.innerHTML = `
      <div class="schedule-card-label-row">
        <div class="message-avatar">
          <img src="logo for talk.svg" width="40" height="40" alt="Elisi">
        </div>
        <div class="ai-label">Elisi</div>
      </div>
      ${introHtml}
      <div class="planner-card">
        <div class="planner-card-top-bg"></div>
        <div class="planner-week-nav">
          <button class="planner-week-arrow planner-prev">
            <img src="icon-week-left.svg" width="30" height="30" alt="prev">
          </button>
          <div class="planner-week-label">
            <span>Week</span>
            <span class="planner-week-num">${weekNum}</span>
          </div>
          <button class="planner-week-arrow planner-next">
            <img src="icon-week-right.svg" width="30" height="30" alt="next">
          </button>
        </div>
        <div class="planner-days">${buildDaysHtml(0)}</div>
        <div class="planner-task-list">${buildTasksHtml(selectedDayIndex)}</div>
      </div>
    `;

    const weekNumEl = msgEl.querySelector('.planner-week-num');
    const daysContainer = msgEl.querySelector('.planner-days');
    const taskListContainer = msgEl.querySelector('.planner-task-list');

    msgEl.querySelector('.planner-prev').addEventListener('click', () => {
      weekOffset--;
      selectedDayIndex = 0;
      updateDisplay();
    });

    msgEl.querySelector('.planner-next').addEventListener('click', () => {
      weekOffset++;
      selectedDayIndex = 0;
      updateDisplay();
    });

    bindDayClicks();
    bindTaskClicks();

    chatMessages.appendChild(msgEl);
    scrollToChat(msgEl);
    return msgEl;
  }

  // --- Note Count Card Rendering ---
  function renderNoteCountCard(data) {
    const allNotes = [...historyNotes, ...createdNotes];
    const totalCount = allNotes.length;

    const introText = data.introText
      ? data.introText.replace(/\d+\s*(条|个|篇|份)?\s*(笔记|notes?)/i, `${totalCount} ` + (data.introText.match(/(条|个|篇|份)?\s*(笔记)/) ? '$1笔记' : 'notes'))
      : `You have ${totalCount} note${totalCount !== 1 ? 's' : ''}.`;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message ai-message schedule-card-message';
    msgEl.innerHTML = `
      <div class="schedule-card-label-row">
        <div class="message-avatar">
          <img src="logo for talk.svg" width="40" height="40" alt="Elisi">
        </div>
        <div class="ai-label">Elisi</div>
      </div>
      <div class="card-intro-bubble"><div class="message-bubble"></div></div>
      <div class="note-count-action-btn">
        <span class="note-count-btn-icon">📒</span>
        <span>查看所有笔记</span>
      </div>
    `;

    const bubble = msgEl.querySelector('.message-bubble');
    bubble.textContent = introText;

    const actionBtn = msgEl.querySelector('.note-count-action-btn');
    actionBtn.addEventListener('click', safeTap(() => {
      openNotePage();
    }));

    chatMessages.appendChild(msgEl);
    scrollToChat(msgEl);
    return msgEl;
  }

  // --- Gemini API (with schedule card support) ---
  async function callApi() {
    const url = `${API_BASE_URL}/v1/chat/completions`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory
    ];

    const body = {
      model: API_MODEL,
      messages,
      temperature: 0.8,
      top_p: 0.95,
      max_tokens: 1024
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data.error?.message || `API error: ${response.status}`;
        throw new Error(errMsg);
      }

      const reply = data.choices?.[0]?.message?.content;
      if (!reply) {
        throw new Error('No response from API');
      }

      removeTypingIndicator();

      // Try to extract and parse card JSON from reply
      let cardData = null;
      try {
        // Strip markdown code blocks if present
        let cleaned = reply.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        // Try direct parse first
        cardData = JSON.parse(cleaned);
      } catch (e) {
        // Try to find a JSON object embedded in the text
        const jsonMatch = reply.match(/\{[\s\S]*"type"\s*:\s*"(schedule_card|planner_card|note_card|note_update|note_count_card)"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            cardData = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            // Could not parse, treat as text
          }
        }
      }

      // Extract natural language text (everything outside the JSON block)
      function extractNaturalText(raw) {
        return raw
          .replace(/```json\n?[\s\S]*?```/g, '')
          .replace(/\{[\s\S]*"type"\s*:\s*"(schedule_card|planner_card|note_card|note_update|note_count_card)"[\s\S]*\}/g, '')
          .trim();
      }

      if (cardData?.type === 'schedule_card') {
        const text = extractNaturalText(reply);
        if (text) cardData.introText = cardData.introText || text;
        renderScheduleCard(cardData);
      } else if (cardData?.type === 'planner_card') {
        const text = extractNaturalText(reply);
        if (text) cardData.introText = cardData.introText || text;
        renderPlannerCard(cardData);
      } else if (cardData?.type === 'note_count_card') {
        const text = extractNaturalText(reply);
        if (text) cardData.introText = cardData.introText || text;
        renderNoteCountCard(cardData);
      } else if (cardData?.type === 'note_card') {
        const noteData = { title: cardData.title || 'Untitled', content: cardData.content || '', createdAt: Date.now() };
        if (lastChatImages.length > 0) {
          noteData.image = lastChatImages[0];
          noteData.detailImage = lastChatImages[0];
          noteData.images = [...lastChatImages];
          lastChatImages = [];
        }
        const text = extractNaturalText(reply);
        const intro = cardData.introText || text || null;
        renderNotesInChat([noteData], intro);
        createdNotes.push(noteData);
        syncedNoteCount = createdNotes.length;
      } else if (cardData?.type === 'note_update') {
        const lastNote = createdNotes[createdNotes.length - 1];
        if (lastNote) {
          if (cardData.title) lastNote.title = cardData.title;
          if (cardData.content) lastNote.content = cardData.content;
          refreshNoteCards();
        }
        const text = extractNaturalText(reply);
        const intro = cardData.introText || text || 'Note updated! ✅';
        const msgEl = appendMessage('', 'ai');
        typewriterEffect(msgEl.querySelector('.message-bubble'), intro);
      } else {
        const msgEl = appendMessage('', 'ai');
        typewriterEffect(msgEl.querySelector('.message-bubble'), reply);
      }

      conversationHistory.push({ role: 'assistant', content: reply });

    } catch (error) {
      removeTypingIndicator();
      let errorMsg;
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMsg = '网络连接失败，请检查网络后重试。';
      } else {
        errorMsg = `出错了: ${error.message}`;
      }
      appendMessage(errorMsg, 'ai');
    }
  }
  // --- Quick Record Menu ---
  const quickRecordOverlay = document.getElementById('quickRecordOverlay');
  const quickRecordClose = document.getElementById('quickRecordClose');

  if (chatToolBtn && quickRecordOverlay) {
    chatToolBtn.addEventListener('click', () => {
      quickRecordOverlay.classList.add('active');
    });

    quickRecordClose.addEventListener('click', () => {
      quickRecordOverlay.classList.remove('active');
    });

    quickRecordOverlay.addEventListener('click', (e) => {
      if (e.target === quickRecordOverlay) {
        quickRecordOverlay.classList.remove('active');
      }
    });

    document.querySelectorAll('.quick-record-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        quickRecordOverlay.classList.remove('active');

        if (action === 'notes') {
          openNotePage();
          return;
        }

        chatInput.focus();
        const prompts = {
          planner: 'Help me plan my schedule for today',
          tasks: 'I want to add a new task',
          habits: 'Help me track my habits'
        };
        if (prompts[action]) {
          chatInput.value = prompts[action];
          chatInput.focus();
        }
      });
    });
  }

  // --- Note Creation Page ---
  const noteCreationPage = document.getElementById('noteCreationPage');
  const notePageClose = document.getElementById('notePageClose');
  const notePageContent = document.getElementById('notePageContent');
  const notePageInput = document.getElementById('notePageInput');
  const notePageMicBtn = document.getElementById('notePageMicBtn');
  const notePageSendBtn = document.getElementById('notePageSendBtn');
  const notePageImgBtn = document.getElementById('notePageImgBtn');
  const notePageImgInput = document.getElementById('notePageImgInput');
  let createdNotes = [];
  let notePageInitialized = false;
  let syncedNoteCount = 0;
  let pendingImages = [];
  const noteInputImages = document.getElementById('noteInputImages');
  // All notes from history mock data
  const historyNotes = [
    { title: "Today's Insight", content: 'The reason for our happiness lies within ourselves, not outside of ourselves.', image: 'pic_note.png', detailImage: 'note-detail-img.png', createdAt: new Date('2025-02-21').getTime() },
    { title: 'Remember to take the keys', content: 'Always check before leaving: keys, wallet, phone. Put a reminder note on the door handle tonight.', createdAt: new Date('2025-02-24').getTime() },
    { title: 'The Courage to Be Disliked', content: 'It hopes that I can be disliked this year. True freedom comes from not seeking validation from others. Adlerian psychology teaches us that all problems are interpersonal relationship problems.', createdAt: new Date('2025-03-01').getTime() },
  ];

  function openNotePage() {
    notePageInput.value = '';
    notePageInput.style.height = 'auto';
    notePageSendBtn.classList.add('hidden');
    notePageMicBtn.classList.remove('hidden');

    // Reset pending images
    pendingImages = [];
    if (noteInputImages) renderInputImages();

    // Always reset to note list view (close history detail if open)
    const noteHistoryPanel = document.getElementById('noteHistoryPanel');
    if (noteHistoryPanel) noteHistoryPanel.classList.remove('active');

    const allNotes = [...historyNotes, ...createdNotes]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const totalNotes = allNotes.length;

    notePageContent.innerHTML = '';
    if (totalNotes > 0) {
      addNotePageAiMessage(`You have ${totalNotes} note${totalNotes > 1 ? 's' : ''}.`);
      allNotes.forEach(note => {
        addNotePageCard(note);
      });
    }

    noteCreationPage.classList.add('active');
    setTimeout(() => notePageInput.focus(), 400);
  }

  function closeNotePage() {
    noteCreationPage.classList.remove('active');

    // Sync only new notes to main chat
    const newNotes = createdNotes.slice(syncedNoteCount);
    if (newNotes.length > 0) {
      syncedNoteCount = createdNotes.length;
      setTimeout(() => {
        renderNotesInChat(newNotes);
      }, 400);
    }
  }

  function addNotePageAiMessage(text, showHeader = true) {
    const msg = document.createElement('div');
    msg.className = 'note-page-ai-msg';
    if (showHeader) {
      msg.innerHTML = `
        <div class="note-ai-label-row">
          <img src="note-page-logo.svg" width="38" height="38" alt="Elisi">
          <span>Elisi</span>
        </div>
        <div class="note-ai-text"></div>
      `;
    } else {
      msg.className = 'card-intro-bubble';
      msg.innerHTML = `<div class="message-bubble"></div>`;
      msg.querySelector('.message-bubble').textContent = text;
      notePageContent.appendChild(msg);
      notePageContent.scrollTop = notePageContent.scrollHeight;
      return;
    }
    msg.querySelector('.note-ai-text').textContent = text;
    notePageContent.appendChild(msg);
    notePageContent.scrollTop = notePageContent.scrollHeight;
  }

  function addNotePageLabelRow() {
    const row = document.createElement('div');
    row.className = 'schedule-card-label-row';
    row.innerHTML = `
      <div class="message-avatar">
        <img src="logo for talk.svg" width="40" height="40" alt="Elisi">
      </div>
      <div class="ai-label">Elisi</div>
    `;
    row.style.animation = 'fadeInUp 0.3s ease';
    notePageContent.appendChild(row);
    notePageContent.scrollTop = notePageContent.scrollHeight;
  }

  function createNoteCardElement(noteData) {
    const card = document.createElement('div');
    card.className = 'note-card-item' + (noteData.image ? ' has-image' : '');
    if (noteData.image) {
      card.innerHTML = `
        <img class="note-card-item-img" src="${noteData.image}" alt="">
        <div class="note-card-item-text">
          <div class="note-card-item-title"></div>
          <div class="note-card-item-desc"></div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="note-card-item-title"></div>
        <div class="note-card-item-desc"></div>
      `;
    }
    card.querySelector('.note-card-item-title').textContent = noteData.title;
    const descEl = card.querySelector('.note-card-item-desc');
    if (noteData.content) {
      descEl.textContent = noteData.content;
    } else {
      descEl.textContent = 'No content yet';
      descEl.classList.add('placeholder');
    }
    card._noteData = noteData;
    card.addEventListener('click', safeTap(() => {
      openNoteDetail(noteData);
    }));
    return card;
  }

  function addNotePageCard(noteData) {
    const card = createNoteCardElement(noteData);
    notePageContent.appendChild(card);
    notePageContent.scrollTop = notePageContent.scrollHeight;
    return card;
  }

  function addNotePageTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'note-page-ai-msg';
    indicator.id = 'noteTypingIndicator';
    indicator.innerHTML = `
      <div class="note-ai-label-row">
        <img src="note-page-logo.svg" width="38" height="38" alt="Elisi">
        <span>Elisi</span>
      </div>
      <div class="note-ai-text" style="display:flex;gap:4px;">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    notePageContent.appendChild(indicator);
    notePageContent.scrollTop = notePageContent.scrollHeight;
  }

  function removeNotePageTypingIndicator() {
    const indicator = document.getElementById('noteTypingIndicator');
    if (indicator) indicator.remove();
  }

  // Close button
  if (notePageClose) {
    notePageClose.addEventListener('click', closeNotePage);
  }

  // --- History Panel ---
  const noteHistoryPanel = document.getElementById('noteHistoryPanel');
  const noteHistoryClose = document.getElementById('noteHistoryClose');
  const noteHistoryList = document.getElementById('noteHistoryList');
  const notePageHistory = document.getElementById('notePageHistory');

  // Mock history conversations with full chat data
  const mockHistoryConversations = [
    {
      day: '01', month: 'Mar',
      summaries: ['It hopes that I can be disliked this year...'],
      conversations: [
        {
          notes: [
            { title: 'The Courage to Be Disliked', content: 'It hopes that I can be disliked this year. True freedom comes from not seeking validation from others. Adlerian psychology teaches us that all problems are interpersonal relationship problems.' },
          ],
          messages: [
            { role: 'user', text: 'I just finished reading "The Courage to Be Disliked", want to note down some thoughts' },
            { role: 'ai-label' },
            { role: 'ai', text: 'Note recorded! Would you like to add a title? I suggest: "Reading Reflection", or type your own.' },
            { role: 'card', noteIndex: 0 },
            { role: 'user', text: 'The Courage to Be Disliked' },
            { role: 'ai-label' },
            { role: 'ai', text: 'Great title! Your note has been updated.' },
            { role: 'card', noteIndex: 0 },
          ]
        }
      ]
    },
    {
      day: '24', month: 'Feb',
      summaries: ['Remember to take the keys'],
      conversations: [
        {
          notes: [
            { title: 'Remember to take the keys', content: 'Always check before leaving: keys, wallet, phone. Put a reminder note on the door handle tonight.' },
          ],
          messages: [
            { role: 'user', text: 'Always check before leaving: keys, wallet, phone. Put a reminder note on the door' },
            { role: 'ai-label' },
            { role: 'ai', text: 'Note recorded! Would you like to add a title? I suggest: "Daily Reminder", or type your own.' },
            { role: 'card', noteIndex: 0 },
            { role: 'user', text: 'Remember to take the keys' },
            { role: 'ai-label' },
            { role: 'ai', text: 'Great title! Your note has been updated.' },
            { role: 'card', noteIndex: 0 },
          ]
        }
      ]
    },
    {
      day: '21', month: 'Feb',
      summaries: ["Today's Insight"],
      conversations: [
        {
          notes: [
            { title: "Today's Insight", content: 'The reason for our happiness lies within ourselves, not outside of ourselves.', image: 'pic_note.png', detailImage: 'note-detail-img.png' },
          ],
          messages: [
            { role: 'user', text: 'The reason for our happiness lies within ourselves, not outside of ourselves.' },
            { role: 'ai-label' },
            { role: 'ai', text: 'Beautiful thought! Would you like to add a title? I suggest: "Today\'s Insight", or type your own.' },
            { role: 'card', noteIndex: 0 },
            { role: 'user', text: "Today's Insight" },
            { role: 'ai-label' },
            { role: 'ai', text: 'Great title! Your note has been updated.' },
            { role: 'card', noteIndex: 0 },
          ]
        }
      ]
    }
  ];

  function renderHistoryConversation(convData) {
    notePageContent.innerHTML = '';
    notePageContent.scrollTop = 0;
    pendingNoteData = null;
    pendingNoteCardEl = null;

    // Collect all notes from conversation groups
    const allNotes = [];
    convData.conversations.forEach(conv => {
      conv.notes.forEach(n => allNotes.push(n));
    });

    // Show note count header
    addNotePageAiMessage(`This chat has ${allNotes.length} note${allNotes.length > 1 ? 's' : ''}`);

    // Render each conversation's messages
    convData.conversations.forEach(conv => {
      conv.messages.forEach(msg => {
        if (msg.role === 'user') {
          const userMsg = document.createElement('div');
          userMsg.className = 'note-page-ai-msg';
          userMsg.style.alignSelf = 'flex-end';
          userMsg.style.flexDirection = 'row-reverse';
          userMsg.innerHTML = `<div class="message-bubble note-user-bubble"></div>`;
          userMsg.querySelector('.message-bubble').textContent = msg.text;
          notePageContent.appendChild(userMsg);
        } else if (msg.role === 'ai-label') {
          addNotePageLabelRow();
        } else if (msg.role === 'ai') {
          addNotePageAiMessage(msg.text, false);
        } else if (msg.role === 'card') {
          const note = conv.notes[msg.noteIndex];
          if (note) addNotePageCard(note);
        }
      });
    });
    // Scroll to top after rendering
    notePageContent.scrollTop = 0;
  }

  function openNoteHistory() {
    noteHistoryList.innerHTML = '';

    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentSummary = createdNotes.length > 0
      ? createdNotes[createdNotes.length - 1].title
      : 'New conversation';

    // Current session entry
    const currentEntry = { day: 'Today', month: months[now.getMonth()], summaries: [currentSummary], isCurrent: true };
    const allEntries = [currentEntry, ...mockHistoryConversations];

    allEntries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'note-history-item';

      let summariesHtml = '';
      entry.summaries.forEach(s => {
        summariesHtml += `<div class="note-history-summary">${escapeHtml(s)}</div>`;
      });

      item.innerHTML = `
        <div class="note-history-date">
          <span class="note-history-day">${escapeHtml(entry.day)}</span>
          <span class="note-history-month">${escapeHtml(entry.month)}</span>
        </div>
        <div class="note-history-summaries">${summariesHtml}</div>
      `;

      item.addEventListener('click', () => {
        noteHistoryPanel.classList.remove('active');
        if (entry.isCurrent) {
          // Back to current conversation
          openNotePage();
        } else {
          // Load history conversation
          renderHistoryConversation(entry);
        }
      });

      noteHistoryList.appendChild(item);
    });

    // Add bottom divider
    const bottomDivider = document.createElement('div');
    bottomDivider.className = 'note-history-bottom-divider';
    noteHistoryList.appendChild(bottomDivider);

    noteHistoryPanel.classList.add('active');
  }

  if (notePageHistory) {
    notePageHistory.addEventListener('click', openNoteHistory);
  }

  if (noteHistoryClose) {
    noteHistoryClose.addEventListener('click', () => {
      noteHistoryPanel.classList.remove('active');
    });
  }

  // Input toggle mic/send + auto-resize
  if (notePageInput) {
    const noteBox = notePageInput.closest('.note-input-box');
    const singleLineH = 34;
    const maxNoteInputH = 140;

    function autoResizeNoteInput() {
      notePageInput.style.height = 'auto';
      const h = Math.min(notePageInput.scrollHeight, maxNoteInputH);
      notePageInput.style.height = h + 'px';
      notePageInput.style.overflowY = notePageInput.scrollHeight > maxNoteInputH ? 'auto' : 'hidden';
      if (h > singleLineH) {
        noteBox.classList.add('multiline');
      } else {
        noteBox.classList.remove('multiline');
      }
    }

    const noteInputActions = document.querySelector('#notePageInputBar .note-input-actions');

    notePageInput.addEventListener('input', () => {
      autoResizeNoteInput();
      if (notePageInput.value.trim().length > 0) {
        notePageMicBtn.classList.add('hidden');
        notePageSendBtn.classList.remove('hidden');
        noteInputActions.classList.add('typing');
      } else {
        notePageSendBtn.classList.add('hidden');
        notePageMicBtn.classList.remove('hidden');
        noteInputActions.classList.remove('typing');
      }
    });

    notePageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendNoteMessage();
      }
    });
  }

  if (notePageSendBtn) {
    notePageSendBtn.addEventListener('click', sendNoteMessage);
  }

  // Image upload button
  if (notePageImgBtn && notePageImgInput) {
    notePageImgBtn.addEventListener('click', () => {
      if (pendingImages.length >= 18) return;
      notePageImgInput.click();
    });

    notePageImgInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      const remaining = 18 - pendingImages.length;
      files.slice(0, remaining).forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          pendingImages.push(ev.target.result);
          renderInputImages();
        };
        reader.readAsDataURL(file);
      });
      notePageImgInput.value = '';
    });
  }

  function renderInputImages() {
    noteInputImages.innerHTML = '';
    if (pendingImages.length === 0) {
      noteInputImages.classList.remove('has-images');
      return;
    }
    noteInputImages.classList.add('has-images');
    pendingImages.forEach((url, idx) => {
      const item = document.createElement('div');
      item.className = 'note-input-image-item';
      item.innerHTML = `<img src="${url}" alt=""><button class="note-input-image-item-delete">&times;</button>`;
      item.querySelector('.note-input-image-item-delete').addEventListener('click', () => {
        pendingImages.splice(idx, 1);
        renderInputImages();
      });
      noteInputImages.appendChild(item);
    });
  }

  // Note page conversation history (separate from chat)
  let noteConversationHistory = [];

  const NOTE_SYSTEM_PROMPT = `You are Elisi, a friendly AI note assistant. Your job is to help users create and organize notes.

Respond naturally in the same language the user uses. Follow the user's language preference.

CRITICAL RULES:
- NEVER include thinking process or reasoning in your response.
- NEVER wrap anything in code blocks.
- Respond with natural language only.

IMPORTANT BEHAVIOR:
- When the user expresses intent to create a note (e.g. "新建笔记", "记录一下", "create a note", "I want to write something down"), DO NOT create the note yet. Instead, ask what content they want to record. Respond naturally like: "好的，你想记录什么内容呢？😊"
- When the user provides actual note content (not just an intent to create), directly create the note with a suitable title and optimized content. Respond with a brief confirmation.
- When the user sends an image (with or without text), analyze the image content and directly create a note based on what you see. Describe the image content in the note.
- For general conversation or requests to modify existing notes, respond naturally.

To help you distinguish:
- Intent messages: "新建笔记", "帮我记一下", "create a note", "I want to take a note" → Ask for content, do NOT create card
- Content messages: actual text content like "明天要买牛奶", "Meeting notes: discussed Q3 targets" → This IS the note content, directly create with a title
- If intent + content together: "帮我记一下明天要买牛奶" → This contains actual content, directly create with a title
- Image messages: user sends an image → Analyze it and directly create a note with a descriptive title and content based on the image

When the user asks to modify/update the most recently created note (e.g. "把标题改成xxx", "内容加上xxx", "change the title to xxx", "update the content"), use the "update" action. Only include the fields that need to change (title and/or content).

You must output ONLY a JSON object (no other text) in this format to indicate your decision:
{"action":"ask","message":"your question asking for content"}
or
{"action":"create","message":"your brief confirmation","title":"a short title under 30 chars","content":"the optimized/polished note content"}
or
{"action":"update","message":"your brief confirmation","title":"optional new title","content":"optional new content"}
or
{"action":"chat","message":"your natural response"}

IMPORTANT for "create" action:
- The "title" field should be a short, descriptive title (under 30 characters) for the note.
- The "content" field should contain the full, polished note content (optimized, well-organized, and improved based on the user's input).
- If the user asks you to help write, optimize, or enhance the note, put the improved content in the "content" field.
- If the user just provides raw content without asking for optimization, still clean it up slightly and put it in the "content" field.`;

  async function callNoteApi(text, images) {
    const url = `${API_BASE_URL}/v1/chat/completions`;

    // Build multimodal content if images are provided
    let userContent;
    if (images && images.length > 0) {
      const contentParts = [];
      images.forEach(src => {
        contentParts.push({
          type: 'image_url',
          image_url: { url: src }
        });
      });
      contentParts.push({ type: 'text', text: text || 'Please describe what you see in this image and create a note based on it.' });
      userContent = contentParts;
    } else {
      userContent = text;
    }

    noteConversationHistory.push({ role: 'user', content: userContent });

    const messages = [
      { role: 'system', content: NOTE_SYSTEM_PROMPT },
      ...noteConversationHistory
    ];

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({ model: API_MODEL, messages, temperature: 0.8, max_tokens: 1024 })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `API error: ${response.status}`);

      const reply = data.choices?.[0]?.message?.content;
      if (!reply) throw new Error('No response from API');

      noteConversationHistory.push({ role: 'assistant', content: reply });

      // Parse action JSON
      let parsed = null;
      try {
        let cleaned = reply.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        const jsonMatch = reply.match(/\{[\s\S]*"action"\s*:[\s\S]*\}/);
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]); } catch (e2) {}
        }
      }

      if (parsed && parsed.action && parsed.message) {
        return { action: parsed.action, message: parsed.message, content: parsed.content || null, title: parsed.title || null };
      }
      // Fallback: treat as plain chat
      return { action: 'chat', message: reply };
    } catch (error) {
      return { action: 'error', message: error.message };
    }
  }

  // States: 'idle' | 'waiting_content'
  let noteFlowState = 'idle';

  function sendNoteMessage() {
    const text = notePageInput.value.trim();
    const hasImages = pendingImages.length > 0;
    if (!text && !hasImages) return;

    // Capture images before clearing
    const messagePendingImages = [...pendingImages];

    // Show user message
    const userMsg = document.createElement('div');
    userMsg.className = 'note-page-ai-msg';
    userMsg.style.alignSelf = 'flex-end';
    userMsg.style.flexDirection = 'row-reverse';
    userMsg.innerHTML = `<div class="message-bubble note-user-bubble"></div>`;
    const bubble = userMsg.querySelector('.message-bubble');
    if (text) bubble.textContent = text;
    else bubble.textContent = '';
    messagePendingImages.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.style.cssText = 'max-width:200px;border-radius:8px;margin-top:4px;display:block';
      bubble.appendChild(img);
    });
    notePageContent.appendChild(userMsg);

    notePageInput.value = '';
    notePageInput.style.height = 'auto';
    pendingImages = [];
    renderInputImages();
    notePageSendBtn.classList.add('hidden');
    notePageMicBtn.classList.remove('hidden');
    document.querySelector('#notePageInputBar .note-input-actions').classList.remove('typing');

    addNotePageTypingIndicator();
    notePageContent.scrollTop = notePageContent.scrollHeight;

    if (noteFlowState === 'waiting_content') {
      // User is providing actual note content after being asked
      callNoteApi(text, messagePendingImages).then(({ action, message, content, title }) => {
        removeNotePageTypingIndicator();
        if (action === 'create') {
          const noteData = {
            title: title || 'Untitled',
            content: content || text,
            createdAt: Date.now()
          };
          if (messagePendingImages.length > 0) {
            noteData.image = messagePendingImages[0];
            noteData.detailImage = messagePendingImages[0];
            noteData.images = [...messagePendingImages];
          }
          createdNotes.push(noteData);
          addNotePageLabelRow();
          addNotePageAiMessage(message, false);
          addNotePageCard(noteData);
        } else if (action === 'update') {
          const lastNote = createdNotes[createdNotes.length - 1];
          if (lastNote) {
            if (title) lastNote.title = title;
            if (content) lastNote.content = content;
            refreshNoteCards();
          }
          addNotePageLabelRow();
          addNotePageAiMessage(message, false);
        } else {
          addNotePageLabelRow();
          addNotePageAiMessage(message, false);
        }
        noteFlowState = 'idle';
      });
    } else {
      // idle — let API decide: ask for content or create directly
      callNoteApi(text, messagePendingImages).then(({ action, message, content, title }) => {
        removeNotePageTypingIndicator();

        if (action === 'ask') {
          addNotePageLabelRow();
          addNotePageAiMessage(message, false);
          noteFlowState = 'waiting_content';
        } else if (action === 'create') {
          const noteData = {
            title: title || 'Untitled',
            content: content || text,
            createdAt: Date.now()
          };
          if (messagePendingImages.length > 0) {
            noteData.image = messagePendingImages[0];
            noteData.detailImage = messagePendingImages[0];
            noteData.images = [...messagePendingImages];
          }
          createdNotes.push(noteData);

          addNotePageLabelRow();
          addNotePageAiMessage(message, false);
          addNotePageCard(noteData);
          noteFlowState = 'idle';
        } else if (action === 'update') {
          const lastNote = createdNotes[createdNotes.length - 1];
          if (lastNote) {
            if (title) lastNote.title = title;
            if (content) lastNote.content = content;
            refreshNoteCards();
          }
          addNotePageLabelRow();
          addNotePageAiMessage(message, false);
          noteFlowState = 'idle';
        } else {
          addNotePageLabelRow();
          addNotePageAiMessage(message, false);
        }
      });
    }
  }

  // Render note cards in main chat after closing note page
  function renderNotesInChat(notes, customIntro) {
    const count = notes.length;
    const summaryText = customIntro || `You have ${count} note${count > 1 ? 's' : ''}. 📝`;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message ai-message schedule-card-message';
    msgEl.innerHTML = `
      <div class="schedule-card-label-row">
        <div class="message-avatar">
          <img src="logo for talk.svg" width="40" height="40" alt="Elisi">
        </div>
        <div class="ai-label">Elisi</div>
      </div>
      <div class="card-intro-bubble"><div class="message-bubble">${escapeHtml(summaryText)}</div></div>
      <div class="chat-note-cards"></div>
    `;

    const cardsContainer = msgEl.querySelector('.chat-note-cards');
    notes.forEach(note => {
      const card = createNoteCardElement(note);
      cardsContainer.appendChild(card);
    });

    chatMessages.appendChild(msgEl);
    scrollToChat(msgEl);
  }

})();
