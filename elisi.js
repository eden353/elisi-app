(() => {
  const GEMINI_MODEL = 'gemini-2.0-flash';
  const STORAGE_KEY = 'elisi_gemini_api_key';

  const SYSTEM_PROMPT = `You are Elisi, a friendly and helpful AI life management assistant. You help users with:
- Task management and formulation
- Schedule planning
- Recording inspiration and ideas
- Building good habits

Keep responses concise, warm, and actionable. Use occasional emojis to stay friendly.
Respond in the same language the user writes in.

IMPORTANT: When the user asks about today's plans, schedule, or tasks (e.g. "What plans do we have for today?"), you MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "type": "schedule_card",
  "title": "Today's schedule",
  "summary": "A brief 1-2 sentence summary of the day",
  "tasks": [
    {"name": "Task name", "time": "optional time like 09:00", "done": false},
    {"name": "Another task", "time": "14:00", "done": false}
  ],
  "notes": [
    {"content": "Note content"}
  ]
}
Generate 2-4 realistic tasks and 0-2 notes. Keep it practical and helpful.

IMPORTANT: When the user asks about this week's plans, weekly schedule, or weekly planner (e.g. "What's the plan for this week?", "查看本周计划"), you MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "type": "planner_card",
  "tasks": [
    {"name": "Task name"},
    {"name": "Another task"}
  ]
}
Generate 2-4 realistic weekly tasks.

IMPORTANT: When the user wants to create a note or record an idea/thought/inspiration, respond with ONLY a valid JSON object in this exact format, no other text:
{
  "type": "note_card",
  "title": "Note title (concise summary)",
  "content": "The full note content text"
}
Keep the title short (under 30 chars) and capture the essence. The content should elaborate on the user's idea.`;

  // DOM elements
  const mainContent = document.querySelector('.main-content');
  const chatInputPlaceholder = document.getElementById('chatInputPlaceholder');
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatMicBtn = document.getElementById('chatMicBtn');
  const chatMessages = document.getElementById('chatMessages');
  const apiModal = document.getElementById('apiModal');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiSaveBtn = document.getElementById('apiSaveBtn');
  const apiCancelBtn = document.getElementById('apiCancelBtn');

  let conversationHistory = [];
  let isTyping = false;
  let chatActivated = false;

  // --- Activate chat inline ---
  chatInputPlaceholder.addEventListener('click', activateChat);

  function activateChat() {
    if (chatActivated) return;
    chatActivated = true;
    // Hide placeholder, show real input
    chatInputPlaceholder.classList.add('hidden');
    chatInput.classList.add('visible');
    // Keep mic visible, send hidden until user types
    chatInput.focus();
  }

  function deactivateChat() {
    chatActivated = false;
    chatInput.value = '';
    chatInput.classList.remove('visible');
    chatInputPlaceholder.classList.remove('hidden');
    chatSendBtn.classList.add('hidden');
    chatMicBtn.classList.remove('hidden');
  }

  // Toggle mic/send based on input content
  chatInput.addEventListener('input', () => {
    if (chatInput.value.trim().length > 0) {
      chatMicBtn.classList.add('hidden');
      chatSendBtn.classList.remove('hidden');
    } else {
      chatSendBtn.classList.add('hidden');
      chatMicBtn.classList.remove('hidden');
    }
  });

  // --- Send Message ---
  chatSendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Click outside input to deactivate
  document.addEventListener('click', (e) => {
    if (!chatActivated) return;
    const wrapper = document.getElementById('chatInputWrapper');
    if (!wrapper.contains(e.target)) {
      deactivateChat();
    }
  });

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isTyping) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      showApiModal();
      return;
    }

    appendMessage(text, 'user');
    chatInput.value = '';
    deactivateChat();
    conversationHistory.push({ role: 'user', parts: [{ text }] });

    showTypingIndicator();
    callGemini(apiKey, text);
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
  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY);
  }

  function showApiModal() {
    apiKeyInput.value = getApiKey() || '';
    apiModal.classList.add('active');
    setTimeout(() => apiKeyInput.focus(), 100);
  }

  apiSaveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
      apiModal.classList.remove('active');
      // Retry sending if there was a pending message
      const lastUserMsg = conversationHistory[conversationHistory.length - 1];
      if (lastUserMsg?.role === 'user') {
        showTypingIndicator();
        callGemini(key, lastUserMsg.parts[0].text);
      }
    }
  });

  apiCancelBtn.addEventListener('click', () => {
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
    // Change icon to note icon
    document.querySelector('.task-detail-title-icon').innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 2h8l4 4v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="#121212" stroke-width="1.5" fill="none"/><path d="M12 2v4h4" stroke="#121212" stroke-width="1.5" fill="none"/><path d="M6 10h8M6 14h5" stroke="#121212" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    // Hide project dot
    taskDetailProjectDot.style.display = 'none';

    // Set note title in project name area
    taskDetailProject.textContent = noteData.title || 'Untitled Note';
    // Set note title in title area
    taskDetailTitle.textContent = noteData.title || '';

    // Remove existing note content area
    const existingNoteArea = document.querySelector('.note-detail-content-area');
    if (existingNoteArea) existingNoteArea.remove();

    // Add note content textarea after title section
    const titleSection = document.querySelector('.task-detail-title-section');
    const noteArea = document.createElement('div');
    noteArea.className = 'note-detail-content-area';
    noteArea.innerHTML = `<textarea class="note-detail-textarea" placeholder="Write your note...">${escapeHtml(noteData.content || '')}</textarea>`;
    titleSection.after(noteArea);

    // Update content on change
    const textarea = noteArea.querySelector('.note-detail-textarea');
    textarea.addEventListener('input', () => {
      if (currentTaskData) {
        currentTaskData.content = textarea.value;
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
    currentDetailType = 'task';
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
    goalCards[0].addEventListener('click', () => {
      sendQuickAction('What\'s the plan for this week?');
    });
  }
  if (goalCards[1]) {
    goalCards[1].addEventListener('click', () => {
      sendQuickAction('What plans do we have for today?');
    });
  }

  function sendQuickAction(text) {
    if (isTyping) return;

    // Activate chat UI
    if (!chatActivated) {
      chatActivated = true;
      chatInputPlaceholder.classList.add('hidden');
      chatInput.classList.add('visible');
      chatSendBtn.classList.remove('hidden');
      chatMicBtn.classList.add('hidden');
    }

    // Append user message with quick-action style
    appendQuickActionMessage(text);

    // Demo mode: simulate AI response with mock data
    showTypingIndicator();
    setTimeout(() => {
      removeTypingIndicator();
      if (text.includes('this week') || text.includes('本周')) {
        renderPlannerCard({
          introText: "Here are your tasks for this week, please check! \u{1F4CB}",
          tasks: [
            { name: '\u{1F468}\u200D\u{1F4BB} Vibe Coding' },
            { name: '\u{1F6B4}\u{1F3FB} Cycling workout' },
            { name: 'Weekly meeting' }
          ]
        });
      } else {
        const now = new Date();
        const hours = now.getHours();
        renderScheduleCard({
          introText: "Here's your schedule for today, take a look! \u{1F4C5}",
          type: 'schedule_card',
          title: "Today's schedule",
          summary: 'Today is steady, starting with creating a study plan, mainly to recharge myself.',
          tasks: [
            { name: 'Create a weekly study plan', time: '09:00', done: hours >= 9 },
            { name: 'Readerta Chapter 3-5', time: '10:30', done: false },
            { name: 'Practice English listening', time: '14:00', done: false }
          ],
          notes: [
            { content: 'Remember to review notes from last week' }
          ]
        });
      }
    }, 1200);
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

    collapsed.addEventListener('click', expandCards);
    msgEl.querySelector('.collapse-btn').addEventListener('click', collapseCardsHandler);

    // Click expanded task cards to open detail panel
    const expandedCards = msgEl.querySelectorAll('.expanded-card.task-card-large, .expanded-card.task-card-small');
    expandedCards.forEach((card) => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
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
      });
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
        item.addEventListener('click', () => {
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
        });
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
        col.addEventListener('click', () => {
          selectedDayIndex = parseInt(col.dataset.day);
          updateDisplay();
        });
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

  // --- Gemini API (with schedule card support) ---
  async function callGemini(apiKey, userMessage) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const body = {
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: conversationHistory,
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 1024
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data.error?.message || `API error: ${response.status}`;
        throw new Error(errMsg);
      }

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) {
        const blockReason = data.candidates?.[0]?.finishReason || 'unknown';
        throw new Error(`No response (reason: ${blockReason})`);
      }

      removeTypingIndicator();

      // Try to parse as card JSON
      let cardData = null;
      try {
        const cleaned = reply.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        cardData = JSON.parse(cleaned);
      } catch (e) {
        // Not JSON, render as normal text
      }

      if (cardData?.type === 'schedule_card') {
        renderScheduleCard(cardData);
      } else if (cardData?.type === 'planner_card') {
        renderPlannerCard(cardData);
      } else if (cardData?.type === 'note_card') {
        const noteData = { title: cardData.title || 'Untitled', content: cardData.content || '' };
        renderNotesInChat([noteData]);
      } else {
        const msgEl = appendMessage('', 'ai');
        typewriterEffect(msgEl.querySelector('.message-bubble'), reply);
      }

      conversationHistory.push({ role: 'model', parts: [{ text: reply }] });

    } catch (error) {
      removeTypingIndicator();
      let errorMsg;
      if (error.message.includes('API_KEY_INVALID') || error.message.includes('API key not valid')) {
        errorMsg = 'API Key 无效，请检查后重试。长按左上角 Elisi 图标可重新设置。';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
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
  const chatToolBtn = document.querySelector('.chat-tool-btn');

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

        activateChat();
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
  let createdNotes = [];
  let notePageInitialized = false;
  let syncedNoteCount = 0;
  // All notes from history mock data
  const historyNotes = [
    { title: "Today's Insight", content: 'The reason for our happiness lies within ourselves, not outside of ourselves.', image: 'pic_note.png' },
    { title: 'Remember to take the keys', content: 'Always check before leaving: keys, wallet, phone. Put a reminder note on the door handle tonight.' },
    { title: 'The Courage to Be Disliked', content: 'It hopes that I can be disliked this year. True freedom comes from not seeking validation from others. Adlerian psychology teaches us that all problems are interpersonal relationship problems.' },
  ];

  function openNotePage() {
    notePageInput.value = '';
    notePageInput.style.height = 'auto';
    notePageSendBtn.classList.add('hidden');
    notePageMicBtn.classList.remove('hidden');

    // Always reset to note list view (close history detail if open)
    const noteHistoryPanel = document.getElementById('noteHistoryPanel');
    if (noteHistoryPanel) noteHistoryPanel.classList.remove('active');

    const allNotes = [...historyNotes, ...createdNotes];
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

  function addNotePageCard(noteData) {
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
    card.querySelector('.note-card-item-desc').textContent = noteData.content;
    card.addEventListener('click', () => {
      openNoteDetail(noteData);
    });
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
            { title: "Today's Insight", content: 'The reason for our happiness lies within ourselves, not outside of ourselves.', image: 'pic_note.png' },
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
    function autoResizeNoteInput() {
      notePageInput.style.height = 'auto';
      notePageInput.style.height = notePageInput.scrollHeight + 'px';
    }

    notePageInput.addEventListener('input', () => {
      autoResizeNoteInput();
      if (notePageInput.value.trim().length > 0) {
        notePageMicBtn.classList.add('hidden');
        notePageSendBtn.classList.remove('hidden');
      } else {
        notePageSendBtn.classList.add('hidden');
        notePageMicBtn.classList.remove('hidden');
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

  // Demo mock title suggestions based on content keywords
  const mockTitleSuggestions = [
    'Mindful Moments',
    'Spark of Inspiration',
    'Daily Reflection',
    'Creative Thinking',
    'Goal Planning',
    'Learning Notes',
  ];
  let mockTitleIndex = 0;

  // State: null = waiting for content, object = waiting for title
  let pendingNoteData = null;
  let pendingNoteCardEl = null;

  function sendNoteMessage() {
    const text = notePageInput.value.trim();
    if (!text) return;

    // Show user message
    const userMsg = document.createElement('div');
    userMsg.className = 'note-page-ai-msg';
    userMsg.style.alignSelf = 'flex-end';
    userMsg.style.flexDirection = 'row-reverse';
    userMsg.innerHTML = `<div class="message-bubble note-user-bubble"></div>`;
    userMsg.querySelector('.message-bubble').textContent = text;
    notePageContent.appendChild(userMsg);

    notePageInput.value = '';
    notePageInput.style.height = 'auto';
    notePageSendBtn.classList.add('hidden');
    notePageMicBtn.classList.remove('hidden');

    addNotePageTypingIndicator();
    notePageContent.scrollTop = notePageContent.scrollHeight;

    if (pendingNoteData) {
      // User is providing a title for the pending note
      setTimeout(() => {
        removeNotePageTypingIndicator();

        // Update the note data and old card
        pendingNoteData.title = text;
        if (pendingNoteCardEl) {
          pendingNoteCardEl.querySelector('.note-card-item-title').textContent = text;
        }

        // Order: label row → text → card
        addNotePageLabelRow();
        addNotePageAiMessage(`Great title! Your note has been updated.`, false);
        addNotePageCard(pendingNoteData);

        // Reset state
        pendingNoteData = null;
        pendingNoteCardEl = null;
      }, 800);
    } else {
      // User is providing note content — create card with "Untitled"
      setTimeout(() => {
        removeNotePageTypingIndicator();

        const noteData = {
          title: 'Untitled',
          content: text
        };
        createdNotes.push(noteData);

        // AI suggests a title
        const suggestion = mockTitleSuggestions[mockTitleIndex % mockTitleSuggestions.length];
        mockTitleIndex++;

        // Order: label row → text → card
        addNotePageLabelRow();
        addNotePageAiMessage(`Note recorded! Would you like to add a title? I suggest: "${suggestion}", or type your own.`, false);
        pendingNoteCardEl = addNotePageCard(noteData);
        pendingNoteData = noteData;
      }, 1000);
    }
  }

  // Render note cards in main chat after closing note page
  function renderNotesInChat(notes) {
    const count = notes.length;
    const summaryText = `You have ${count} note${count > 1 ? 's' : ''}. 📝`;

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
      const card = document.createElement('div');
      card.className = 'note-card-item' + (note.image ? ' has-image' : '');
      if (note.image) {
        card.innerHTML = `
          <img class="note-card-item-img" src="${note.image}" alt="">
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
      card.querySelector('.note-card-item-title').textContent = note.title;
      card.querySelector('.note-card-item-desc').textContent = note.content;
      card.addEventListener('click', () => {
        openNoteDetail(note);
      });
      cardsContainer.appendChild(card);
    });

    chatMessages.appendChild(msgEl);
    scrollToChat(msgEl);
  }

})();
