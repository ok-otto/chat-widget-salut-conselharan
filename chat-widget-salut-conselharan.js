// Chat Widget Script - Versió 6.6 - ARAN RESPON
// Amb sistema híbrid d'idiomes, millores UX i optimització de flux

(function() {
    'use strict';

    // Prevenir múltiples inicialitzacions
    if (window.AranChatWidgetInitialized) return;
    window.AranChatWidgetInitialized = true;

    // ==================== CONFIGURACIÓ I CONSTANTS ====================

// Map d’idiomes (fora de DEFAULT_CONFIG)
const IDIOMA_TAGS = { ca: 'català', es: 'español', oc: 'aranès' };
    
    const DEFAULT_CONFIG = {

        webhook: {
            url: '',
            route: '',
            timeout: 30000,
            maxRetries: 3
        },
        branding: {
            logo: '',
            name: '',
            welcomeText: '',
            responseTimeText: '',
            poweredBy: {
                text: 'Desenvolupat per ok-otto',
                link: 'https://www.ok-otto.com/?utm_source=chatbotaran'
            }
        },
        style: {
            primaryColor: '#854fff',
            secondaryColor: '#6b3fd4',
            position: 'right',
            backgroundColor: '#ffffff',
            fontColor: '#333333'
        },
        features: {
            persistHistory: true,
            maxHistoryMessages: 50,
            maxMessageLength: 1000,
            enableTypingIndicator: true,
            enableConnectionStatus: true,
            scrollBehavior: 'smooth'
        }
    };

    // ==================== UTILITATS ====================
    
    class Utils {
        static generateUUID() {
            return crypto.randomUUID ? crypto.randomUUID() : 
                'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
        }

        static debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        static sanitizeHTML(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        static formatText(text) {
            // Primer sanititzem el text
            const escapedText = this.sanitizeHTML(text);
            
            // Convertim markdown a HTML de forma segura
            let formattedText = escapedText
                // Headers
                .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                // Botons d'enllaç
                .replace(/\[BOTÓ:([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                    const safeUrl = this.isValidUrl(url) ? url : '#';
                    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-button">${this.sanitizeHTML(text)}</a>`;
                })
                .replace(/\[BOTÓN:([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                    const safeUrl = this.isValidUrl(url) ? url : '#';
                    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-button">${this.sanitizeHTML(text)}</a>`;
                })
                .replace(/\[BOTON:([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                    const safeUrl = this.isValidUrl(url) ? url : '#';
                    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-button">${this.sanitizeHTML(text)}</a>`;
                })
                // Enllaços normals
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                    const safeUrl = this.isValidUrl(url) ? url : '#';
                    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${this.sanitizeHTML(text)}</a>`;
                })
                // Negreta
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/__(.*?)__/g, '<strong>$1</strong>')
                // Cursiva
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/_(.*?)_/g, '<em>$1</em>');

            // Gestió de paràgrafs
            const blocks = formattedText.split(/\n{2,}/);
            const processedBlocks = blocks.map(block => {
                if (block.match(/^<h[1-6]>/)) return block;
                if (block.trim() === '') return '';
                const processedBlock = block.replace(/\n/g, '<br>');
                return `<p>${processedBlock}</p>`;
            });

            return processedBlocks.filter(block => block.trim() !== '').join('');
        }

        static isValidUrl(string) {
            try {
                const url = new URL(string);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch {
                return false;
            }
        }

        static async fetchWithRetry(url, options = {}, maxRetries = 3) {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);
                    
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeout);
                    
                    if (!response.ok && i < maxRetries - 1) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    return response;
                    
                } catch (error) {
                    if (i === maxRetries - 1) throw error;
                    // Backoff exponencial
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                }
            }
        }
    }

    // ==================== GESTIÓ D'EMMAGATZEMATGE ====================
    
    class StorageManager {
        constructor(config) {
            this.enabled = config.features.persistHistory;
            this.maxMessages = config.features.maxHistoryMessages;
            this.storageKey = 'aran-chat-widget';
        }

        saveSession(sessionId, language) {
            if (!this.enabled) return;
            
            try {
                const data = {
                    sessionId,
                    language,
                    timestamp: new Date().toISOString()
                };
                localStorage.setItem(`${this.storageKey}-session`, JSON.stringify(data));
            } catch (e) {
                console.warn('No s\'ha pogut guardar la sessió:', e);
            }
        }

        getSession() {
            if (!this.enabled) return null;
            
            try {
                const data = localStorage.getItem(`${this.storageKey}-session`);
                return data ? JSON.parse(data) : null;
            } catch {
                return null;
            }
        }

        saveMessage(message) {
            if (!this.enabled) return;
            
            try {
                const history = this.getHistory();
                history.push({
                    ...message,
                    timestamp: new Date().toISOString()
                });
                
                if (history.length > this.maxMessages) {
                    history.splice(0, history.length - this.maxMessages);
                }
                
                localStorage.setItem(`${this.storageKey}-history`, JSON.stringify(history));
            } catch (e) {
                console.warn('No s\'ha pogut guardar el missatge:', e);
            }
        }

        getHistory() {
            if (!this.enabled) return [];
            
            try {
                const data = localStorage.getItem(`${this.storageKey}-history`);
                return data ? JSON.parse(data) : [];
            } catch {
                return [];
            }
        }

        clearHistory() {
            if (!this.enabled) return;
            
            try {
                localStorage.removeItem(`${this.storageKey}-history`);
                localStorage.removeItem(`${this.storageKey}-session`);
            } catch (e) {
                console.warn('No s\'ha pogut esborrar l\'historial:', e);
            }
        }
    }

    // ==================== GESTOR D'API ====================
    
    class APIManager {
        constructor(webhookConfig) {
            this.url = webhookConfig.url;
            this.route = webhookConfig.route;
            this.timeout = webhookConfig.timeout;
            this.maxRetries = webhookConfig.maxRetries;
        }

        async sendMessage(sessionId, message, metadata = {}) {
            const messageData = {
                action: "sendMessage",
                sessionId: sessionId,
                route: this.route,
                chatInput: message,
                metadata: metadata
            };

            const response = await Utils.fetchWithRetry(this.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messageData),
                timeout: this.timeout
            }, this.maxRetries);

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }

            return await response.json();
        }
    }

    // ==================== SISTEMA DE NAVEGACIÓ ====================
    
    class NavigationSystem {
        constructor(languageTexts) {
            this.languageTexts = languageTexts;
            this.currentLanguage = '';
            this.currentPath = [];
            this.currentLevel = 'categories';
        }

        setLanguage(language) {
            this.currentLanguage = language;
        }

        getTexts() {
            return this.languageTexts[this.currentLanguage];
        }

        createCategoryButtons(container, onNavigate) {
            const texts = this.getTexts();
            const categories = texts.categories;

            const navDiv = document.createElement('div');
            navDiv.className = 'navigation-container';
            
            navDiv.innerHTML = `
                <div class="category-buttons">
                    ${Object.keys(categories).map(key => `
                        <button class="category-btn" data-category="${key}">
                            ${categories[key].title}
                        </button>
                    `).join('')}
                </div>
            `;

            container.appendChild(navDiv);
            
            navDiv.querySelectorAll('.category-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const category = e.target.getAttribute('data-category');
                    onNavigate('category', category);
                });
            });

            this.currentLevel = 'categories';
        }

        createSubcategoryButtons(container, categoryKey, onNavigate) {
            const texts = this.getTexts();
            const category = texts.categories[categoryKey];
            this.currentPath = [categoryKey];

            const navDiv = document.createElement('div');
            navDiv.className = 'navigation-container';
            
            navDiv.innerHTML = `
                <div class="navigation-header">
                    <button class="nav-btn home-btn">${texts.navigation.home}</button>
                    <button class="nav-btn back-btn">${texts.navigation.back}</button>
                    <span class="breadcrumb">${texts.navigation.breadcrumb} ${category.title}</span>
                </div>
                <div class="subcategory-buttons">
                    ${Object.keys(category.subcategories).map(key => `
                        <button class="subcategory-btn" data-subcategory="${key}">
                            ${category.subcategories[key].title}
                        </button>
                    `).join('')}
                </div>
            `;

            container.appendChild(navDiv);
            
            navDiv.querySelector('.home-btn').addEventListener('click', () => onNavigate('home'));
            navDiv.querySelector('.back-btn').addEventListener('click', () => onNavigate('back'));
            navDiv.querySelectorAll('.subcategory-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const subcategory = e.target.getAttribute('data-subcategory');
                    onNavigate('subcategory', categoryKey, subcategory);
                });
            });

            this.currentLevel = 'subcategories';
        }

        createOptionButtons(container, categoryKey, subcategoryKey, onNavigate, onSelect) {
            const texts = this.getTexts();
            const category = texts.categories[categoryKey];
            let options, breadcrumbText;

            if (subcategoryKey) {
                options = category.subcategories[subcategoryKey].options;
                breadcrumbText = `${category.title} > ${category.subcategories[subcategoryKey].title}`;
                this.currentPath = [categoryKey, subcategoryKey];
            } else {
                options = category.options;
                breadcrumbText = category.title;
                this.currentPath = [categoryKey];
            }

            const navDiv = document.createElement('div');
            navDiv.className = 'navigation-container';
            
            navDiv.innerHTML = `
                <div class="navigation-header">
                    <button class="nav-btn home-btn">${texts.navigation.home}</button>
                    <button class="nav-btn back-btn">${texts.navigation.back}</button>
                    <span class="breadcrumb">${texts.navigation.breadcrumb} ${breadcrumbText}</span>
                </div>
                <div class="option-buttons">
                    ${Object.keys(options).map(key => `
                        <button class="option-btn" data-message="${Utils.sanitizeHTML(options[key].message)}">
                            ${options[key].title}
                        </button>
                    `).join('')}
                </div>
            `;

            container.appendChild(navDiv);
            
            navDiv.querySelector('.home-btn').addEventListener('click', () => onNavigate('home'));
            navDiv.querySelector('.back-btn').addEventListener('click', () => onNavigate('back'));
            navDiv.querySelectorAll('.option-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const message = e.target.getAttribute('data-message');
                    onSelect(message);
                });
            });

            this.currentLevel = 'options';
        }

        clearNavigation(container) {
            const navContainer = container.querySelector('.navigation-container');
            if (navContainer) navContainer.remove();
        }
    }

    // ==================== GESTOR D'ESTAT DE CONNEXIÓ ====================
    
    class ConnectionStatus {
        constructor(container) {
            this.container = container;
            this.online = navigator.onLine;
            this.statusElement = null;
            this.init();
        }

        init() {
            this.createStatusElement();
            this.bindEvents();
            this.updateStatus();
        }

        createStatusElement() {
            this.statusElement = document.createElement('div');
            this.statusElement.className = 'connection-status';
            this.statusElement.innerHTML = `
                <span class="status-indicator"></span>
                <span class="status-text"></span>
            `;
            this.container.appendChild(this.statusElement);
        }

        bindEvents() {
            window.addEventListener('online', () => this.updateStatus());
            window.addEventListener('offline', () => this.updateStatus());
        }

        updateStatus() {
            this.online = navigator.onLine;
            this.statusElement.classList.toggle('offline', !this.online);
            const statusText = this.statusElement.querySelector('.status-text');
            statusText.textContent = this.online ? '' : 'Sense connexió';
        }

        isOnline() {
            return this.online;
        }
    }

    // ==================== CLASSE PRINCIPAL DEL WIDGET ====================
    
    class AranChatWidget {
        constructor(userConfig) {
            this.config = this.mergeConfig(userConfig);
            this.sessionId = '';
            this.selectedLanguage = '';
            this.isOpen = false;
            this.messageQueue = [];
            this.hasUserInteracted = false; // Flag per saber si és la primera interacció real
            
            // Inicialitzar components
            this.storage = new StorageManager(this.config);
            this.api = new APIManager(this.config.webhook);
            this.navigation = new NavigationSystem(this.getLanguageTexts());
            
            // Elements DOM
            this.container = null;
            this.chatContainer = null;
            this.messagesContainer = null;
            this.connectionStatus = null;
            
            this.init();
        }

        mergeConfig(userConfig) {
            if (!userConfig) return DEFAULT_CONFIG;
            
            return {
                webhook: { ...DEFAULT_CONFIG.webhook, ...userConfig.webhook },
                branding: { ...DEFAULT_CONFIG.branding, ...userConfig.branding },
                style: { ...DEFAULT_CONFIG.style, ...userConfig.style },
                features: { ...DEFAULT_CONFIG.features, ...userConfig.features }
            };
        }

        init() {
            this.injectStyles();
            this.createWidget();
            this.bindEvents();
            this.restoreSession();
            this.preventZoomOnMobile();
            this.open();
        }

        injectStyles() {
            // Carregar font Geist
            const fontLink = document.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.href = 'https://cdn.jsdelivr.net/npm/geist@1.0.0/dist/fonts/geist-sans/style.css';
            document.head.appendChild(fontLink);

            // Injectar estils
            const styleSheet = document.createElement('style');
            styleSheet.textContent = this.getStyles();
            document.head.appendChild(styleSheet);
        }

        createWidget() {
            // Contenidor principal
            this.container = document.createElement('div');
            this.container.className = 'n8n-chat-widget';
            
            // Aplicar variables CSS personalitzades
            this.container.style.setProperty('--n8n-chat-primary-color', this.config.style.primaryColor);
            this.container.style.setProperty('--n8n-chat-secondary-color', this.config.style.secondaryColor);
            this.container.style.setProperty('--n8n-chat-background-color', this.config.style.backgroundColor);
            this.container.style.setProperty('--n8n-chat-font-color', this.config.style.fontColor);

            // Contenidor del xat
            this.chatContainer = document.createElement('div');
            this.chatContainer.className = `chat-container${this.config.style.position === 'left' ? ' position-left' : ''}`;
            
            // HTML inicial
            this.chatContainer.innerHTML = this.getInitialHTML();
            
            // Botó toggle
            const toggleButton = document.createElement('button');
            toggleButton.className = `chat-toggle${this.config.style.position === 'left' ? ' position-left' : ''}`;
            toggleButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2.5 21.5l4.5-.838A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.476 0-2.886-.313-4.156-.878l-3.156.586.586-3.156A7.962 7.962 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/>
                </svg>`;
            toggleButton.setAttribute('aria-label', 'Obrir xat d\'assistència');
            
            this.container.appendChild(this.chatContainer);
            this.container.appendChild(toggleButton);
            document.body.appendChild(this.container);

            // Assignar referències a elements
            this.toggleButton = toggleButton;
            this.chatInterface = this.chatContainer.querySelector('.chat-interface');
            this.messagesContainer = this.chatContainer.querySelector('.chat-messages');
            this.textarea = this.chatContainer.querySelector('textarea');
            this.sendButton = this.chatContainer.querySelector('button[type="submit"]');
            
            // Inicialitzar estat de connexió si està habilitat
            if (this.config.features.enableConnectionStatus) {
                const brandHeader = this.chatContainer.querySelector('.chat-interface .brand-header');
                this.connectionStatus = new ConnectionStatus(brandHeader);
            }
        }

        bindEvents() {
            // Toggle button
            this.toggleButton.addEventListener('click', () => this.toggle());
            
            // Close buttons
            this.chatContainer.querySelectorAll('.close-button').forEach(button => {
                button.addEventListener('click', () => this.close());
            });
            
            // Language buttons
            this.chatContainer.querySelectorAll('.language-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.selectLanguage(e.target.getAttribute('data-lang')));
            });
            
            // Send button amb debounce
            const debouncedSend = Utils.debounce(() => this.sendCurrentMessage(), 300);
            this.sendButton.addEventListener('click', debouncedSend);
            
            // Textarea events
            this.textarea.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    debouncedSend();
                }
            });
            
            // Auto-resize textarea
            this.textarea.addEventListener('input', () => this.autoResizeTextarea());
            
            // Keyboard accessibility
            this.chatContainer.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.close();
            });
            
            // Handle mobile keyboard
            if (window.innerWidth <= 480) {
                this.textarea.addEventListener('focus', () => {
                    // Ensure input area stays visible when keyboard appears
                    setTimeout(() => {
                        const chatInput = this.chatContainer.querySelector('.chat-input');
                        if (chatInput) {
                            chatInput.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }
                    }, 300);
                });

                this.textarea.addEventListener('blur', () => {
                    // Reset viewport when keyboard disappears
                    setTimeout(() => {
                        window.scrollTo(0, 0);
                    }, 100);
                });
            }
        }

        toggle() {
            this.isOpen ? this.close() : this.open();
        }

        open() {
            this.chatContainer.classList.add('open');
            this.isOpen = true;
            this.toggleButton.setAttribute('aria-expanded', 'true');
            
            // Focus trap
            setTimeout(() => {
                const firstFocusable = this.chatContainer.querySelector('button, textarea, a[href]');
                if (firstFocusable) firstFocusable.focus();
            }, 100);
        }

        close() {
            this.chatContainer.classList.remove('open');
            this.isOpen = false;
            this.toggleButton.setAttribute('aria-expanded', 'false');
        }

        async selectLanguage(language) {
            this.selectedLanguage = language;
            this.navigation.setLanguage(language);
            
            // Actualitzar visual dels botons
            this.chatContainer.querySelectorAll('.language-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.getAttribute('data-lang') === language);
            });
            
            // Actualitzar textos
            const texts = this.getLanguageTexts()[language];
            this.textarea.placeholder = texts.placeholder;
            this.sendButton.textContent = texts.sendBtn;
            
            // Actualitzar footer
            const footerLink = this.chatContainer.querySelector('.chat-footer a');
            if (footerLink) {
                footerLink.textContent = texts.poweredBy;
            }
            
            // Guardar selecció
            this.storage.saveSession(this.sessionId, language);
            
            // Iniciar conversa
            await this.startNewConversation();
        }

        async startNewConversation() {
            this.hasUserInteracted = false;
            if (!this.selectedLanguage) {
                this.showError('Selecciona un idioma primer / Selecciona un idioma primero');
                return;
            }

            // Generar nou ID de sessió
            this.sessionId = Utils.generateUUID();
            this.storage.saveSession(this.sessionId, this.selectedLanguage);
            
            // Canviar a interfície de xat
            this.chatContainer.querySelector('.brand-header').style.display = 'none';
            this.chatContainer.querySelector('.new-conversation').style.display = 'none';
            this.chatContainer.querySelector('.chat-interface').classList.add('active');

            try {
                const texts = this.getLanguageTexts()[this.selectedLanguage];

                // Mostrar salutació
                this.addBotMessage(texts.greeting, true);
                // Marca que hem saludat des del client
this.localGreetingShown = true;

                // Mostrar categories després d'un petit delay
                setTimeout(() => {
                    this.navigation.createCategoryButtons(
                        this.messagesContainer,
                        this.handleNavigation.bind(this)
                    );
                    // Scroll al fons per veure les categories
                    this.scrollToBottom();
                }, 500);

            } catch (error) {
                console.error('Error iniciant conversa:', error);
                this.showError('Error iniciant la conversa. Torna-ho a intentar.');
            }
        }

        async sendCurrentMessage() {
            const message = this.textarea.value.trim();
            
            if (!message) return;
            
            // Validar longitud
            if (message.length > this.config.features.maxMessageLength) {
                this.showError(`El missatge és massa llarg (màxim ${this.config.features.maxMessageLength} caràcters)`);
                return;
            }
            
            // Comprovar connexió
            if (this.connectionStatus && !this.connectionStatus.isOnline()) {
                this.showError('No hi ha connexió a Internet');
                this.messageQueue.push(message); // Guardar per enviar més tard
                return;
            }
            
            // Netejar textarea
            this.textarea.value = '';
            this.autoResizeTextarea();
            
            await this.sendMessage(message);
        }

        async sendMessage(message, metadata = {}) {
  // És el primer missatge de l’usuari?
  const isInitialMessage = !this.hasUserInteracted;
  if (isInitialMessage) this.hasUserInteracted = true;

  // Mostra a la UI el text tal qual (sense etiqueta)
  this.addUserMessage(message);

  // Neteja navegació i mostra "escrivint..."
  // Línia comentada intencionadament per canviar el comportament del xat.
  // Abans: El menú de botons s'esborrava en enviar un missatge de text.
  // Ara: El menú es manté visible per millorar l'experiència d'usuari i l'accés ràpid a les opcions.
  // NO DESCOMENTAR si no es vol revertir aquest canvi.
  // this.navigation.clearNavigation(this.messagesContainer);
  if (this.config.features.enableTypingIndicator) this.showTypingIndicator();
  this.setInputEnabled(false);

  try {
    // Prefix d’idioma NOMÉS al primer missatge que s’envia al backend
    const idiomaTag = IDIOMA_TAGS[this.selectedLanguage] || this.selectedLanguage;
    const payloadMessage = isInitialMessage ? `[IDIOMA:${idiomaTag}] ${message}` : message;

    // Metadata amb idioma i si és primer missatge
    const enhancedMetadata = {
      userId: "",
      preferredLanguage: this.selectedLanguage, // "ca" | "es" | "oc"
      isInitialMessage: false,
      ...metadata
    };

    // Enviament al teu webhook
    const response = await this.api.sendMessage(
      this.sessionId,
      payloadMessage,
      enhancedMetadata
    );

    // Amaga "escrivint..." i pinta la resposta del bot
    this.hideTypingIndicator();
    const botResponse = Array.isArray(response) ? response[0].output : response.output;
    this.addBotMessage(botResponse);

    // Desa a l’historial
    this.storage.saveMessage({ type: 'user', content: message });
    this.storage.saveMessage({ type: 'bot', content: botResponse });

  } catch (error) {
    this.hideTypingIndicator();
    console.error('Error enviant missatge:', error);
    if (error.message.includes('timeout')) this.showError('La resposta està tardant massa. Torna-ho a intentar.');
    else this.showError('No s\'ha pogut enviar el missatge. Comprova la connexió.');
  } finally {
    this.setInputEnabled(true);
    this.textarea.focus();
  }
}

        addUserMessage(message) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message user';
            messageDiv.textContent = message;
            messageDiv.setAttribute('role', 'log');
            messageDiv.setAttribute('aria-label', `Tu: ${message}`);
            this.messagesContainer.appendChild(messageDiv);
            
            // Scroll normal al fons quan l'usuari envia
            this.scrollToBottom();
        }

        addBotMessage(message, isLocal = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message bot';
            messageDiv.innerHTML = Utils.formatText(message);
            messageDiv.setAttribute('role', 'log');
            messageDiv.setAttribute('aria-label', `Assistent: ${message.replace(/<[^>]*>/g, '')}`);
            
            // Marcar si és un missatge local (no del servidor)
            if (isLocal) {
                messageDiv.setAttribute('data-local', 'true');
            }
            
            this.messagesContainer.appendChild(messageDiv);
            
            // Fem scroll per mostrar l'últim missatge de l'usuari
            // Només si NO és un missatge local (salutació inicial)
            if (!isLocal) {
                setTimeout(() => this.scrollToShowUserMessage(), 100);
            } else {
                this.scrollToBottom();
            }
        }

        showTypingIndicator() {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'typing-indicator';
            typingDiv.id = 'typing-indicator';
            typingDiv.innerHTML = `
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            `;
            typingDiv.setAttribute('aria-label', 'L\'assistent està escrivint');
            this.messagesContainer.appendChild(typingDiv);
            
            // Fem scroll per mostrar l'indicador
            setTimeout(() => {
                typingDiv.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'end',
                    inline: 'nearest'
                });
            }, 100);
        }

        hideTypingIndicator() {
            const indicator = document.getElementById('typing-indicator');
            if (indicator) indicator.remove();
        }

        showError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = message;
            errorDiv.setAttribute('role', 'alert');
            this.messagesContainer.appendChild(errorDiv);
            
            // Eliminar després de 5 segons
            setTimeout(() => errorDiv.remove(), 5000);
            
            // Scroll per mostrar error
            this.scrollToBottom();
        }

        setInputEnabled(enabled) {
            this.textarea.disabled = !enabled;
            this.sendButton.disabled = !enabled;
            
            const texts = this.getLanguageTexts()[this.selectedLanguage];
            if (!enabled) {
                // Utilitzar el text d'enviament traduït segons l'idioma
                this.sendButton.textContent = texts ? texts.sendingBtn : 'Enviant...';
            } else {
                this.sendButton.textContent = texts ? texts.sendBtn : 'Enviar';
            }
        }

        autoResizeTextarea() {
            this.textarea.style.height = 'auto';
            const newHeight = Math.min(this.textarea.scrollHeight, 76); // Max 76px
            this.textarea.style.height = newHeight + 'px';
        }

        scrollToBottom() {
            setTimeout(() => {
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }, 100);
        }

        scrollToShowUserMessage() {
            // Funció per fer scroll mostrant l'últim missatge de l'usuari
            const userMessages = this.messagesContainer.querySelectorAll('.chat-message.user');
            if (userMessages.length > 0) {
                const lastUserMessage = userMessages[userMessages.length - 1];
                // Fem scroll suau per mostrar l'últim missatge de l'usuari a la part superior
                lastUserMessage.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start',
                    inline: 'nearest'
                });
            }
        }

        handleNavigation(action, ...args) {
            const container = this.messagesContainer;
            
            // Netejar navegació actual
            this.navigation.clearNavigation(container);
            
            switch (action) {
                case 'home':
                    this.navigation.createCategoryButtons(
                        container,
                        this.handleNavigation.bind(this)
                    );
                    break;
                    
                case 'back':
                    if (this.navigation.currentLevel === 'subcategories') {
                        this.navigation.createCategoryButtons(
                            container,
                            this.handleNavigation.bind(this)
                        );
                    } else if (this.navigation.currentLevel === 'options') {
                        const [category] = this.navigation.currentPath;
                        if (this.navigation.currentPath.length > 1) {
                            this.navigation.createSubcategoryButtons(
                                container,
                                category,
                                this.handleNavigation.bind(this)
                            );
                        } else {
                            this.navigation.createCategoryButtons(
                                container,
                                this.handleNavigation.bind(this)
                            );
                        }
                    }
                    break;
                    
                case 'category':
                    const [categoryKey] = args;
                    const texts = this.getLanguageTexts()[this.selectedLanguage];
                    const category = texts.categories[categoryKey];
                    
                    if (category.subcategories) {
                        this.navigation.createSubcategoryButtons(
                            container,
                            categoryKey,
                            this.handleNavigation.bind(this)
                        );
                    } else {
                        this.navigation.createOptionButtons(
                            container,
                            categoryKey,
                            null,
                            this.handleNavigation.bind(this),
                            (message) => this.sendMessage(message) // Enviar directament
                        );
                    }
                    break;
                    
                case 'subcategory':
                    const [catKey, subcatKey] = args;
                    this.navigation.createOptionButtons(
                        container,
                        catKey,
                        subcatKey,
                        this.handleNavigation.bind(this),
                        (message) => this.sendMessage(message) // Enviar directament
                    );
                    break;
            }
            
            this.scrollToBottom();
        }

        restoreSession() {
            const session = this.storage.getSession();
            if (!session) return;
            
            // Restaurar sessió si és recent (menys de 24 hores)
            const sessionDate = new Date(session.timestamp);
            const now = new Date();
            const hoursDiff = (now - sessionDate) / (1000 * 60 * 60);
            
            if (hoursDiff < 24) {
                this.sessionId = session.sessionId;
                this.selectedLanguage = session.language;
                
                // Restaurar historial si existeix
                const history = this.storage.getHistory();
                if (history.length > 0) {
                    // Marcar que l'usuari ja ha interactuat si hi ha historial
                    this.hasUserInteracted = history.some(msg => msg.type === 'user');
                }
            }
        }

        preventZoomOnMobile() {
            if (window.innerWidth > 480) return;
            
            // Configurar viewport
            let viewport = document.querySelector('meta[name=viewport]');
            if (viewport) {
                viewport.setAttribute('content', 
                    'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover'
                );
            } else {
                const newViewport = document.createElement('meta');
                newViewport.name = 'viewport';
                newViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover';
                document.head.appendChild(newViewport);
            }
            
            // Prevenir gestos de zoom
            document.addEventListener('gesturestart', (e) => e.preventDefault());
            document.addEventListener('gesturechange', (e) => e.preventDefault());
            document.addEventListener('gestureend', (e) => e.preventDefault());
            
            // Prevenir doble tap
            let lastTouchEnd = 0;
            document.addEventListener('touchend', (event) => {
                const now = Date.now();
                if (now - lastTouchEnd <= 300) {
                    event.preventDefault();
                }
                lastTouchEnd = now;
            }, false);
        }

        // Retornar HTML inicial
        getInitialHTML() {
            return `
                <div class="brand-header">
                    <img src="${this.config.branding.logo}" alt="${this.config.branding.name}">
                    <span>${this.config.branding.name}</span>
                    <button class="close-button" aria-label="Tancar xat">×</button>
                </div>
                <div class="new-conversation">
                    <div class="language-selection">
                        <h2 class="language-title">Selecciona idioma</h2>
                        <div class="language-buttons">
                            <button class="language-btn" data-lang="ca">Català</button>
                            <button class="language-btn" data-lang="es">Español</button>
                            <button class="language-btn" data-lang="oc">Aranès</button>
                        </div>
                    </div>
                    <h2 class="welcome-text">${this.config.branding.welcomeText}</h2>
                    <p class="response-text">${this.config.branding.responseTimeText}</p>
                </div>
                <div class="chat-interface">
                    <div class="brand-header">
                        <img src="${this.config.branding.logo}" alt="${this.config.branding.name}">
                        <span>${this.config.branding.name}</span>
                        <button class="close-button" aria-label="Tancar xat">×</button>
                    </div>
                    <div class="chat-messages" role="log" aria-live="polite" aria-label="Missatges del xat"></div>
                    <div class="chat-input">
                        <textarea 
                            placeholder="Escriu el teu missatge aquí..." 
                            rows="1"
                            aria-label="Escriu el teu missatge"
                            maxlength="${this.config.features.maxMessageLength}"
                        ></textarea>
                        <button type="submit" aria-label="Enviar missatge">Enviar</button>
                    </div>
                    <div class="chat-footer">
                        <a href="${this.config.branding.poweredBy.link}" target="_blank" rel="noopener">
                            ${this.config.branding.poweredBy.text}
                        </a>
                    </div>
                </div>
            `;
        }

        // Retornar objecte de textos per idioma
        getLanguageTexts() {
            return {
                ca: {
                    btnText: "Envia'ns un missatge",
                    placeholder: "Escriu el teu missatge aquí...",
                    sendBtn: "Enviar",
                    sendingBtn: "Enviant...",
                    greeting: "**Hola! Sóc l'assistent virtual d'ARAN RESPON.** Com puc ajudar-te?",
                    poweredBy: "Desenvolupat per ok-otto",
                    navigation: {
                        back: "← Tornar",
                        home: "🏠 Inici",
                        breadcrumb: "Estàs a:"
                    },
                    categories: {
                        "citas": {
                            title: "Cites mèdiques",
                            subcategories: {
                                "pedir": {
                                    title: "Demanar cita",
                                    options: {
                                        "medicina-general": { 
                                            title: "Medicina general", 
                                            message: "Vull demanar una cita de medicina general" 
                                        },
                                        "pediatria": { 
                                            title: "Pediatria", 
                                            message: "Vull demanar una cita de pediatria" 
                                        },
                                        "especialistas": { 
                                            title: "Especialistes", 
                                            message: "Vull demanar una cita amb un especialista" 
                                        }
                                    }
                                },
                                "reprogramar": {
                                    title: "Reprogramar cita",
                                    options: {
                                        "cambiar-fecha": { 
                                            title: "Canviar data", 
                                            message: "Vull canviar la data d'una cita existent" 
                                        },
                                        "cambiar-especialidad": { 
                                            title: "Canviar especialitat", 
                                            message: "Vull canviar l'especialitat de la meva cita" 
                                        },
                                        "cancelar": { 
                                            title: "Cancel·lar cita", 
                                            message: "Vull cancel·lar una cita mèdica" 
                                        }
                                    }
                                },
                                "consultar": {
                                    title: "Consultar cita",
                                    options: {
                                        "cuando": { 
                                            title: "Quan és la meva propera cita?", 
                                            message: "Vull saber quan és la meva propera cita mèdica" 
                                        },
                                        "donde": { 
                                            title: "On serà?", 
                                            message: "Vull saber on serà la meva cita mèdica" 
                                        }
                                    }
                                }
                            }
                        },
                        "servicios": {
                            title: "Serveis socials",
                            subcategories: {
                                "mayores": {
                                    title: "Ajuda a persones grans",
                                    options: {
                                        "valoracion": { 
                                            title: "Sol·licitud de valoració", 
                                            message: "Necessito una valoració per a serveis socials per a persona gran" 
                                        },
                                        "domiciliarios": { 
                                            title: "Cures domiciliàries", 
                                            message: "Necessito informació sobre cures domiciliàries" 
                                        }
                                    }
                                },
                                "salud-mental": {
                                    title: "Salut mental i suport psicològic",
                                    options: {
                                        "visita": { 
                                            title: "Demanar visita", 
                                            message: "Vull demanar una visita de salut mental" 
                                        },
                                        "urgencia": { 
                                            title: "Urgència emocional", 
                                            message: "Tinc una urgència emocional i necessito ajuda" 
                                        }
                                    }
                                },
                                "otros": {
                                    title: "Altres serveis",
                                    options: {
                                        "dependencia": { 
                                            title: "Informació sobre dependència", 
                                            message: "Necessito informació sobre la Llei de Dependència" 
                                        },
                                        "acompanamiento": { 
                                            title: "Sol·licitud d'acompanyament", 
                                            message: "Necessito serveis d'acompanyament social" 
                                        }
                                    }
                                }
                            }
                        },
                        "informacion": {
                            title: "Informació general",
                            options: {
                                "ubicacion": { 
                                    title: "On som?", 
                                    message: "Vull saber on es troben els centres d'Aran Salut" 
                                },
                                "horarios": { 
                                    title: "Horaris de l'hospital", 
                                    message: "Vull consultar els horaris de l'hospital" 
                                },
                                "contacto": { 
                                    title: "Telèfons i contacte", 
                                    message: "Necessito els telèfons i dades de contacte" 
                                },
                                "documentacion": { 
                                    title: "Documentació necessària per tràmits", 
                                    message: "Quin documentació necessito per fer tràmits?" 
                                }
                            }
                        },
                        "otras": {
                            title: "Altres consultes",
                            options: {
                                "duda-medica": { 
                                    title: "Tinc un dubte mèdic", 
                                    message: "Tinc un dubte mèdic i necessito orientació" 
                                },
                                "emergencias": { 
                                    title: "Emergències", 
                                    message: "És una emergència mèdica" 
                                },
                                "recetas": { 
                                    title: "Receptes i farmàcia", 
                                    message: "Tinc una consulta sobre receptes o farmàcia" 
                                },
                                "ayuda-app": { 
                                    title: "Ajuda amb l'app o el xat", 
                                    message: "Necessito ajuda amb l'aplicació o aquest xat" 
                                }
                            }
                        }
                    }
                },
                es: {
                    btnText: "Envíanos un mensaje",
                    placeholder: "Escribe tu mensaje aquí...",
                    sendBtn: "Enviar",
                    sendingBtn: "Enviando...", 
                    greeting: "**¡Hola! Soy el asistente virtual de ARAN RESPON.** ¿Cómo puedo ayudarte?",
                    poweredBy: "Desarrollado por ok-otto",
                    navigation: {
                        back: "← Volver",
                        home: "🏠 Inicio",
                        breadcrumb: "Estás en:"
                    },
                    categories: {
                        "citas": {
                            title: "Citas médicas",
                            subcategories: {
                                "pedir": {
                                    title: "Pedir cita",
                                    options: {
                                        "medicina-general": { 
                                            title: "Medicina general", 
                                            message: "Quiero pedir una cita de medicina general" 
                                        },
                                        "pediatria": { 
                                            title: "Pediatría", 
                                            message: "Quiero pedir una cita de pediatría" 
                                        },
                                        "especialistas": { 
                                            title: "Especialistas", 
                                            message: "Quiero pedir una cita con un especialista" 
                                        }
                                    }
                                },
                                "reprogramar": {
                                    title: "Reprogramar cita",
                                    options: {
                                        "cambiar-fecha": { 
                                            title: "Cambiar fecha", 
                                            message: "Quiero cambiar la fecha de una cita existente" 
                                        },
                                        "cambiar-especialidad": { 
                                            title: "Cambiar especialidad", 
                                            message: "Quiero cambiar la especialidad de mi cita" 
                                        },
                                        "cancelar": { 
                                            title: "Cancelar cita", 
                                            message: "Quiero cancelar una cita médica" 
                                        }
                                    }
                                },
                                "consultar": {
                                    title: "Consultar cita",
                                    options: {
                                        "cuando": { 
                                            title: "¿Cuándo es mi próxima cita?", 
                                            message: "Quiero saber cuándo es mi próxima cita médica" 
                                        },
                                        "donde": { 
                                            title: "¿Dónde será?", 
                                            message: "Quiero saber dónde será mi cita médica" 
                                        }
                                    }
                                }
                            }
                        },
                        "servicios": {
                            title: "Servicios sociales",
                            subcategories: {
                                "mayores": {
                                    title: "Ayuda a personas mayores",
                                    options: {
                                        "valoracion": { 
                                            title: "Solicitud de valoración", 
                                            message: "Necesito una valoración para servicios sociales para persona mayor" 
                                        },
                                        "domiciliarios": { 
                                            title: "Cuidados domiciliarios", 
                                            message: "Necesito información sobre cuidados domiciliarios" 
                                        }
                                    }
                                },
                                "salud-mental": {
                                    title: "Salud mental y apoyo psicológico",
                                    options: {
                                        "visita": { 
                                            title: "Pedir visita", 
                                            message: "Quiero pedir una visita de salud mental" 
                                        },
                                        "urgencia": { 
                                            title: "Urgencia emocional", 
                                            message: "Tengo una urgencia emocional y necesito ayuda" 
                                        }
                                    }
                                },
                                "otros": {
                                    title: "Otros servicios",
                                    options: {
                                        "dependencia": { 
                                            title: "Información sobre dependencia", 
                                            message: "Necesito información sobre la Ley de Dependencia" 
                                        },
                                        "acompanamiento": { 
                                            title: "Solicitud de acompañamiento", 
                                            message: "Necesito servicios de acompañamiento social" 
                                        }
                                    }
                                }
                            }
                        },
                        "informacion": {
                            title: "Información general",
                            options: {
                                "ubicacion": { 
                                    title: "¿Dónde estamos?", 
                                    message: "Quiero saber dónde están los centros de Aran Salut" 
                                },
                                "horarios": { 
                                    title: "Horarios del hospital", 
                                    message: "Quiero consultar los horarios del hospital" 
                                },
                                "contacto": { 
                                    title: "Teléfonos y contacto", 
                                    message: "Necesito los teléfonos y datos de contacto" 
                                },
                                "documentacion": { 
                                    title: "Documentación necesaria para trámites", 
                                    message: "¿Qué documentación necesito para hacer trámites?" 
                                }
                            }
                        },
                        "otras": {
                            title: "Otras consultas",
                            options: {
                                "duda-medica": { 
                                    title: "Tengo una duda médica", 
                                    message: "Tengo una duda médica y necesito orientación" 
                                },
                                "emergencias": { 
                                    title: "Emergencias", 
                                    message: "Es una emergencia médica" 
                                },
                                "recetas": { 
                                    title: "Recetas y farmacia", 
                                    message: "Tengo una consulta sobre recetas o farmacia" 
                                },
                                "ayuda-app": { 
                                    title: "Ayuda con la app o el chat", 
                                    message: "Necesito ayuda con la aplicación o este chat" 
                                }
                            }
                        }
                    }
                },
                oc: {
                    btnText: "Mandatz-mos un messatge",
                    placeholder: "Escrivètz eth vòstre messatge ací...",
                    sendBtn: "Mandar",
                    sendingBtn: "Mandant...",
                    greeting: "**Adiu! Sòi er assistent virtuau d'ARAN RESPON.** Com pòdi ajudar-te?",
                    poweredBy: "Desvolupat per ok-otto",
                    navigation: {
                        back: "← Tornar",
                        home: "🏠 Inici",
                        breadcrumb: "Ès en:"
                    },
                    categories: {
                        "citas": {
                            title: "Rendètz-vos medics",
                            subcategories: {
                                "pedir": {
                                    title: "Demandar rendètz-vos",
                                    options: {
                                        "medicina-general": { 
                                            title: "Medecina generau", 
                                            message: "Vòli demandar un rendètz-vos de medecina generau" 
                                        },
                                        "pediatria": { 
                                            title: "Pediatria", 
                                            message: "Vòli demandar un rendètz-vos de pediatria" 
                                        },
                                        "especialistas": { 
                                            title: "Especialistes", 
                                            message: "Vòli demandar un rendètz-vos damb un especialista" 
                                        }
                                    }
                                },
                                "reprogramar": {
                                    title: "Reprogramar rendètz-vos",
                                    options: {
                                        "cambiar-fecha": { 
                                            title: "Cambiar data", 
                                            message: "Vòli cambiar era data d'un rendètz-vos existent" 
                                        },
                                        "cambiar-especialidad": { 
                                            title: "Cambiar especialitat", 
                                            message: "Vòli cambiar era especialitat deth meu rendètz-vos" 
                                        },
                                        "cancelar": { 
                                            title: "Anullar rendètz-vos", 
                                            message: "Vòli anullar un rendètz-vos medic" 
                                        }
                                    }
                                },
                                "consultar": {
                                    title: "Consultar rendètz-vos",
                                    options: {
                                        "cuando": { 
                                            title: "Quan ei eth meu següent rendètz-vos?", 
                                            message: "Vòli saber quan ei eth meu següent rendètz-vos medic" 
                                        },
                                        "donde": { 
                                            title: "On serà?", 
                                            message: "Vòli saber on serà eth meu rendètz-vos medic" 
                                        }
                                    }
                                }
                            }
                        },
                        "servicios": {
                            title: "Servicis socials",
                            subcategories: {
                                "mayores": {
                                    title: "Ajuda a persones majors",
                                    options: {
                                        "valoracion": { 
                                            title: "Sol·licitud de valoracion", 
                                            message: "Necessiti ua valoracion entà servicis socials entà persona major" 
                                        },
                                        "domiciliarios": { 
                                            title: "Cures domiciliaris", 
                                            message: "Necessiti informacion sus cures domiciliaris" 
                                        }
                                    }
                                },
                                "salud-mental": {
                                    title: "Salut mentau e supòrt psicologic",
                                    options: {
                                        "visita": { 
                                            title: "Demandar visita", 
                                            message: "Vòli demandar ua visita de salut mentau" 
                                        },
                                        "urgencia": { 
                                            title: "Urgéncia emocionau", 
                                            message: "Ai ua urgéncia emocionau e necessiti ajuda" 
                                        }
                                    }
                                },
                                "otros": {
                                    title: "Auti servicis",
                                    options: {
                                        "dependencia": { 
                                            title: "Informacion sus dependéncia", 
                                            message: "Necessiti informacion sus era Lei de Dependéncia" 
                                        },
                                        "acompanamiento": { 
                                            title: "Sol·licitud d'acompanhament", 
                                            message: "Necessiti servicis d'acompanhament sociau" 
                                        }
                                    }
                                }
                            }
                        },
                        "informacion": {
                            title: "Informacion generau",
                            options: {
                                "ubicacion": { 
                                    title: "On sòm?", 
                                    message: "Vòli saber on se tròben es centres d'Aran Salut" 
                                },
                                "horarios": { 
                                    title: "Oraris dera espitau", 
                                    message: "Vòli consultar es oraris dera espitau" 
                                },
                                "contacto": { 
                                    title: "Telefòns e contacte", 
                                    message: "Necessiti es telefòns e dades de contacte" 
                                },
                                "documentacion": { 
                                    title: "Documentacion necessària entà tramits", 
                                    message: "Quina documentacion necessiti entà hèr tramits?" 
                                }
                            }
                        },
                        "otras": {
                            title: "Autes consultes",
                            options: {
                                "duda-medica": { 
                                    title: "Ai un dobte medic", 
                                    message: "Ai un dobte medic e necessiti orientacion" 
                                },
                                "emergencias": { 
                                    title: "Emergéncies", 
                                    message: "Ei ua emergéncia medica" 
                                },
                                "recetas": { 
                                    title: "Recèptes e farmàcia", 
                                    message: "Ai ua consulta sus recèptes o farmàcia" 
                                },
                                "ayuda-app": { 
                                    title: "Ajuda damb era app o eth chat", 
                                    message: "Necessiti ajuda damb era aplicacion o aqueth chat" 
                                }
                            }
                        }
                    }
                }
            };
        }

        // Retornar estils CSS
        getStyles() {
            return `
                /* ==================== VARIABLES I RESET ==================== */
                
                .n8n-chat-widget {
                    --chat--color-primary: var(--n8n-chat-primary-color, #854fff);
                    --chat--color-secondary: var(--n8n-chat-secondary-color, #6b3fd4);
                    --chat--color-background: var(--n8n-chat-background-color, #ffffff);
                    --chat--color-font: var(--n8n-chat-font-color, #333333);
                    --chat--color-error: #dc2626;
                    --chat--color-success: #10b981;
                    --chat--animation-duration: 0.3s;
                    --chat--border-radius: 12px;
                    --chat--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.05);
                    --chat--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
                    --chat--shadow-lg: 0 8px 32px rgba(133, 79, 255, 0.15);
                    
                    font-family: 'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    box-sizing: border-box;
                }
                
                .n8n-chat-widget *,
                .n8n-chat-widget *::before,
                .n8n-chat-widget *::after {
                    box-sizing: inherit;
                }
                
                /* ==================== CONTENIDOR PRINCIPAL ==================== */
                
                .n8n-chat-widget .chat-container {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 9999;
                    display: none;
                    width: min(380px, calc(100vw - 40px));
                    height: min(600px, calc(100vh - 80px));
                    background: var(--chat--color-background);
                    border-radius: var(--chat--border-radius);
                    box-shadow: var(--chat--shadow-lg);
                    border: 1px solid rgba(133, 79, 255, 0.2);
                    overflow: hidden;
                    font-family: inherit;
                    transition: all var(--chat--animation-duration) ease;
                }
                
                .n8n-chat-widget .chat-container.position-left {
                    right: auto;
                    left: 20px;
                }
                
                .n8n-chat-widget .chat-container.open {
                    display: flex;
                    flex-direction: column;
                    animation: fadeInUp var(--chat--animation-duration) ease;
                }
                
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* ==================== CAPÇALERA ==================== */
                
                .n8n-chat-widget .brand-header {
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border-bottom: 1px solid rgba(133, 79, 255, 0.1);
                    position: relative;
                    background: var(--chat--color-background);
                }
                
                .n8n-chat-widget .brand-header img {
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                }
                
                .n8n-chat-widget .brand-header span {
                    font-size: 18px;
                    font-weight: 500;
                    color: var(--chat--color-font);
                }
                
                .n8n-chat-widget .close-button {
                    position: absolute;
                    right: 16px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    color: var(--chat--color-font);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all var(--chat--animation-duration);
                    font-size: 20px;
                    opacity: 0.6;
                    border-radius: 4px;
                }
                
                .n8n-chat-widget .close-button:hover {
                    opacity: 1;
                    background: rgba(133, 79, 255, 0.1);
                }
                
                .n8n-chat-widget .close-button:focus {
                    outline: 2px solid var(--chat--color-primary);
                    outline-offset: 2px;
                }
                
                /* ==================== ESTAT DE CONNEXIÓ ==================== */
                
                .n8n-chat-widget .connection-status {
                    position: absolute;
                    right: 60px;
                    top: 50%;
                    transform: translateY(-50%);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: var(--chat--color-font);
                    opacity: 0.7;
                }
                
                .n8n-chat-widget .connection-status.offline {
                    color: var(--chat--color-error);
                    opacity: 1;
                }
                
                .n8n-chat-widget .status-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--chat--color-success);
                }
                
                .n8n-chat-widget .connection-status.offline .status-indicator {
                    background: var(--chat--color-error);
                }
                
                /* ==================== PANTALLA INICIAL ==================== */
                
                .n8n-chat-widget .new-conversation {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    padding: 20px;
                    text-align: center;
                    width: 100%;
                    max-width: 300px;
                }
                
                .n8n-chat-widget .language-selection {
                    margin-bottom: 24px;
                }
                
                .n8n-chat-widget .language-title {
                    font-size: 20px;
                    font-weight: 600;
                    color: var(--chat--color-font);
                    margin: 0 0 16px 0;
                }
                
                .n8n-chat-widget .language-buttons {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 6px;
                    justify-content: center;
                }
                
                .n8n-chat-widget .language-btn {
                    padding: 10px 12px;
                    background: transparent;
                    border: 2px solid var(--chat--color-primary);
                    color: var(--chat--color-primary);
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    font-family: inherit;
                    transition: all var(--chat--animation-duration);
                }
                
                .n8n-chat-widget .language-btn:hover {
                    background: var(--chat--color-primary);
                    color: white;
                    transform: scale(1.02);
                }
                
                .n8n-chat-widget .language-btn.selected {
                    background: var(--chat--color-primary);
                    color: white;
                }
                
                .n8n-chat-widget .language-btn:focus {
                    outline: 2px solid var(--chat--color-primary);
                    outline-offset: 2px;
                }
                
                .n8n-chat-widget .welcome-text {
                    font-size: 24px;
                    font-weight: 600;
                    color: var(--chat--color-font);
                    margin-bottom: 24px;
                    line-height: 1.3;
                }
                
                .n8n-chat-widget .response-text {
                    font-size: 14px;
                    color: var(--chat--color-font);
                    opacity: 0.7;
                    margin: 0;
                }
                
                /* ==================== INTERFÍCIE DE XAT ==================== */
                
                .n8n-chat-widget .chat-interface {
                    display: none;
                    flex-direction: column;
                    height: 100%;
                }
                
                .n8n-chat-widget .chat-interface.active {
                    display: flex;
                }
                
                .n8n-chat-widget .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    background: var(--chat--color-background);
                    display: flex;
                    flex-direction: column;
                    scroll-behavior: smooth;
                }
                
                /* ==================== MISSATGES ==================== */
                
                .n8n-chat-widget .chat-message {
                    padding: 12px 16px;
                    margin: 8px 0;
                    border-radius: var(--chat--border-radius);
                    max-width: 80%;
                    word-wrap: break-word;
                    font-size: 14px;
                    line-height: 1.5;
                    animation: messageSlide var(--chat--animation-duration) ease;
                }
                
                @keyframes messageSlide {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .n8n-chat-widget .chat-message.user {
                    background: linear-gradient(135deg, var(--chat--color-primary) 0%, var(--chat--color-secondary) 100%);
                    color: white;
                    align-self: flex-end;
                    box-shadow: var(--chat--shadow-md);
                    border: none;
                }
                
                .n8n-chat-widget .chat-message.bot {
                    background: var(--chat--color-background);
                    border: 1px solid rgba(133, 79, 255, 0.2);
                    color: var(--chat--color-font);
                    align-self: flex-start;
                    box-shadow: var(--chat--shadow-sm);
                }
                
                /* Formatat de text enriquit */
                .n8n-chat-widget .chat-message strong {
                    font-weight: 600;
                }
                
                .n8n-chat-widget .chat-message em {
                    font-style: italic;
                }
                
                .n8n-chat-widget .chat-message h1,
                .n8n-chat-widget .chat-message h2,
                .n8n-chat-widget .chat-message h3 {
                    margin: 8px 0 4px 0;
                    color: var(--chat--color-font);
                    font-weight: 600;
                }
                
                .n8n-chat-widget .chat-message h1 { font-size: 18px; }
                .n8n-chat-widget .chat-message h2 { font-size: 16px; }
                .n8n-chat-widget .chat-message h3 { font-size: 15px; }
                
                .n8n-chat-widget .chat-message p {
                    margin: 0 0 8px 0;
                }
                
                .n8n-chat-widget .chat-message p:last-child {
                    margin-bottom: 0;
                }
                
                .n8n-chat-widget .chat-message a {
                    color: var(--chat--color-primary);
                    text-decoration: underline;
                    transition: opacity var(--chat--animation-duration);
                }
                
                .n8n-chat-widget .chat-message a:hover {
                    opacity: 0.8;
                }
                
                .n8n-chat-widget .chat-message .link-button {
                    display: inline-block;
                    padding: 8px 16px;
                    margin: 8px 0;
                    background: linear-gradient(135deg, var(--chat--color-primary) 0%, var(--chat--color-secondary) 100%);
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    transition: transform var(--chat--animation-duration);
                    border: none;
                    cursor: pointer;
                    font-family: inherit;
                }
                
                .n8n-chat-widget .chat-message .link-button:hover {
                    transform: scale(1.02);
                    color: white;
                    opacity: 1;
                }
                
                /* ==================== INDICADOR DE TYPING ==================== */
                
                .n8n-chat-widget .typing-indicator {
                    padding: 12px 16px;
                    margin: 8px 0;
                    border-radius: var(--chat--border-radius);
                    max-width: 80%;
                    background: var(--chat--color-background);
                    border: 1px solid rgba(133, 79, 255, 0.2);
                    color: var(--chat--color-font);
                    align-self: flex-start;
                    box-shadow: var(--chat--shadow-sm);
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .n8n-chat-widget .typing-dots {
                    display: flex;
                    gap: 3px;
                }
                
                .n8n-chat-widget .typing-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background-color: var(--chat--color-primary);
                    animation: typing 1.4s infinite ease-in-out;
                }
                
                .n8n-chat-widget .typing-dot:nth-child(1) { animation-delay: 0s; }
                .n8n-chat-widget .typing-dot:nth-child(2) { animation-delay: 0.2s; }
                .n8n-chat-widget .typing-dot:nth-child(3) { animation-delay: 0.4s; }
                
                @keyframes typing {
                    0%, 60%, 100% {
                        transform: translateY(0);
                        opacity: 0.4;
                    }
                    30% {
                        transform: translateY(-10px);
                        opacity: 1;
                    }
                }
                
                /* ==================== MISSATGES D'ERROR ==================== */
                
                .n8n-chat-widget .error-message {
                    padding: 10px 14px;
                    margin: 8px 0;
                    background: rgba(220, 38, 38, 0.1);
                    border: 1px solid rgba(220, 38, 38, 0.3);
                    color: var(--chat--color-error);
                    border-radius: 8px;
                    font-size: 13px;
                    animation: shake 0.5s ease;
                }
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                
                /* ==================== SISTEMA DE NAVEGACIÓ ==================== */
                
                .n8n-chat-widget .navigation-container {
                    padding: 20px;
                    background: var(--chat--color-background);
                    border-bottom: 1px solid rgba(133, 79, 255, 0.1);
                    animation: fadeIn var(--chat--animation-duration) ease;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                .n8n-chat-widget .navigation-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                
                .n8n-chat-widget .nav-btn {
                    padding: 8px 14px;
                    background: rgba(133, 79, 255, 0.1);
                    border: 1px solid rgba(133, 79, 255, 0.3);
                    color: var(--chat--color-primary);
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 600;
                    font-family: inherit;
                    transition: all var(--chat--animation-duration) ease;
                }
                
                .n8n-chat-widget .nav-btn:hover {
                    background: var(--chat--color-primary);
                    color: white;
                    transform: scale(1.05);
                }
                
                .n8n-chat-widget .nav-btn:focus {
                    outline: 2px solid var(--chat--color-primary);
                    outline-offset: 2px;
                }
                
                .n8n-chat-widget .breadcrumb {
                    font-size: 13px;
                    color: var(--chat--color-font);
                    opacity: 0.7;
                    margin-left: auto;
                    font-weight: 500;
                }
                
                .n8n-chat-widget .category-buttons,
                .n8n-chat-widget .subcategory-buttons,
                .n8n-chat-widget .option-buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .n8n-chat-widget .category-btn {
                    padding: 14px 18px;
                    background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%);
                    border: 2px solid rgba(133, 79, 255, 0.2);
                    color: var(--chat--color-primary);
                    border-radius: var(--chat--border-radius);
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: 600;
                    font-family: inherit;
                    transition: all var(--chat--animation-duration) ease;
                    text-align: center;
                    box-shadow: var(--chat--shadow-sm);
                    position: relative;
                }
                
                .n8n-chat-widget .category-btn:hover {
                    background: linear-gradient(135deg, var(--chat--color-primary) 0%, var(--chat--color-secondary) 100%);
                    color: white;
                    transform: translateY(-1px);
                    box-shadow: var(--chat--shadow-md);
                    border-color: transparent;
                }
                
                .n8n-chat-widget .category-btn:active {
                    transform: translateY(0px);
                    box-shadow: var(--chat--shadow-sm);
                }
                
                .n8n-chat-widget .category-btn:focus,
                .n8n-chat-widget .subcategory-btn:focus,
                .n8n-chat-widget .option-btn:focus {
                    outline: 2px solid var(--chat--color-primary);
                    outline-offset: 2px;
                }
                
                .n8n-chat-widget .subcategory-btn,
                .n8n-chat-widget .option-btn {
                    padding: 14px 18px;
                    background: rgba(248, 249, 255, 0.8);
                    border: 1px solid rgba(133, 79, 255, 0.2);
                    color: var(--chat--color-primary);
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    font-family: inherit;
                    transition: all var(--chat--animation-duration) ease;
                    text-align: left;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
                }
                
                .n8n-chat-widget .subcategory-btn:hover,
                .n8n-chat-widget .option-btn:hover {
                    background: var(--chat--color-primary);
                    color: white;
                    transform: translateX(4px);
                    box-shadow: var(--chat--shadow-md);
                    border-color: var(--chat--color-primary);
                }
                
                /* ==================== INPUT DE XAT ==================== */
                
                .n8n-chat-widget .chat-input {
                    padding: 16px;
                    background: var(--chat--color-background);
                    border-top: 1px solid rgba(133, 79, 255, 0.1);
                    display: flex;
                    gap: 8px;
                }
                
                .n8n-chat-widget .chat-input textarea {
                    flex: 1;
                    padding: 12px;
                    min-height: 38px;
                    max-height: 76px;
                    border: 1px solid rgba(133, 79, 255, 0.2);
                    border-radius: 8px;
                    background: var(--chat--color-background);
                    color: var(--chat--color-font);
                    resize: none;
                    font-family: inherit;
                    font-size: 14px;
                    line-height: 1.4;
                    overflow-y: auto;
                    transition: border-color var(--chat--animation-duration);
                }
                
                .n8n-chat-widget .chat-input textarea:focus {
                    outline: none;
                    border-color: var(--chat--color-primary);
                }
                
                .n8n-chat-widget .chat-input textarea::placeholder {
                    color: var(--chat--color-font);
                    opacity: 0.6;
                }
                
                .n8n-chat-widget .chat-input textarea:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                .n8n-chat-widget .chat-input button {
                    background: linear-gradient(135deg, var(--chat--color-primary) 0%, var(--chat--color-secondary) 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    padding: 0 20px;
                    cursor: pointer;
                    transition: all var(--chat--animation-duration);
                    font-family: inherit;
                    font-weight: 500;
                    font-size: 14px;
                }
                
                .n8n-chat-widget .chat-input button:hover:not(:disabled) {
                    transform: scale(1.05);
                }
                
                .n8n-chat-widget .chat-input button:focus {
                    outline: 2px solid var(--chat--color-primary);
                    outline-offset: 2px;
                }
                
                .n8n-chat-widget .chat-input button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                /* ==================== BOTÓ TOGGLE ==================== */
                
                .n8n-chat-widget .chat-toggle {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 80px;
                    height: 80px;
                    border-radius: 100px;
                    background: linear-gradient(135deg, var(--chat--color-primary) 0%, var(--chat--color-secondary) 100%);
                    color: white;
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(133, 79, 255, 0.3);
                    z-index: 9998;
                    transition: all var(--chat--animation-duration);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .n8n-chat-widget .chat-toggle.position-left {
                    right: auto;
                    left: 20px;
                }
                
                .n8n-chat-widget .chat-toggle:hover {
                    transform: scale(1.05);
                    box-shadow: 0 6px 20px rgba(133, 79, 255, 0.4);
                }
                
                .n8n-chat-widget .chat-toggle:focus {
                    outline: 2px solid var(--chat--color-primary);
                    outline-offset: 2px;
                }
                
                .n8n-chat-widget .chat-toggle svg {
                    width: 44px;
                    height: 44px;
                    fill: currentColor;
                }
                
                /* ==================== FOOTER ==================== */
                
                .n8n-chat-widget .chat-footer {
                    padding: 8px;
                    text-align: center;
                    background: var(--chat--color-background);
                    border-top: 1px solid rgba(133, 79, 255, 0.1);
                }
                
                .n8n-chat-widget .chat-footer a {
                    color: var(--chat--color-primary);
                    text-decoration: none;
                    font-size: 12px;
                    opacity: 0.8;
                    transition: opacity var(--chat--animation-duration);
                    font-family: inherit;
                }
                
                .n8n-chat-widget .chat-footer a:hover {
                    opacity: 1;
                    text-decoration: underline;
                }
                
                /* ==================== RESPONSIVE MÒBIL ==================== */
                
                @media (max-width: 480px) {
                    .n8n-chat-widget .chat-container {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        width: 100vw;
                        height: 100vh;
                        height: 100dvh;
                        max-width: 100vw;
                        max-height: 100vh;
                        max-height: 100dvh;
                        border-radius: 0;
                        box-shadow: none;
                        border: none;
                        display: none;
                    }
                    
                    .n8n-chat-widget .chat-container.open {
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .n8n-chat-widget .chat-input {
                        padding: 12px;
                        padding-bottom: max(12px, env(safe-area-inset-bottom));
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        width: 100%;
                        box-sizing: border-box;
                        z-index: 10000;
                    }
                    
                    .n8n-chat-widget .chat-input textarea {
                        flex: 1;
                        padding: 10px;
                        min-height: 36px;
                        max-height: 72px;
                        font-size: 16px;
                        -webkit-appearance: none;
                        appearance: none;
                    }
                    
                    .n8n-chat-widget .chat-messages {
                        flex: 1;
                        overflow-y: auto;
                        padding: 16px;
                        padding-bottom: calc(80px + env(safe-area-inset-bottom));
                        height: calc(100vh - 80px);
                        height: calc(100dvh - 80px);
                        -webkit-overflow-scrolling: touch;
                        overscroll-behavior: contain;
                    }
                    
                    .n8n-chat-widget .chat-toggle {
                        bottom: max(15px, env(safe-area-inset-bottom));
                        right: 15px;
                        width: 60px;
                        height: 60px;
                    }
                    
                    .n8n-chat-widget .chat-toggle.position-left {
                        right: auto;
                        left: 15px;
                    }
                    
                    /* Millores tàctils */
                    .n8n-chat-widget * {
                        -webkit-touch-callout: none;
                        -webkit-tap-highlight-color: transparent;
                    }
                    
                    .n8n-chat-widget .chat-message {
                        -webkit-user-select: text;
                        -moz-user-select: text;
                        -ms-user-select: text;
                        user-select: text;
                    }
                    
                    .n8n-chat-widget .chat-messages,
                    .n8n-chat-widget .navigation-container {
                        -webkit-user-select: none;
                        -moz-user-select: none;
                        -ms-user-select: none;
                        user-select: none;
                        touch-action: pan-y;
                    }
                    
                    /* Responsive per pantalles petites */
                    @media (max-height: 600px) {
                        .n8n-chat-widget .chat-messages {
                            padding: 12px;
                            padding-bottom: calc(70px + env(safe-area-inset-bottom));
                            height: calc(100vh - 70px);
                            height: calc(100dvh - 70px);
                        }
                        
                        .n8n-chat-widget .chat-input {
                            padding: 8px;
                            padding-bottom: max(8px, env(safe-area-inset-bottom));
                        }
                        
                        .n8n-chat-widget .chat-input textarea {
                            min-height: 32px;
                            max-height: 64px;
                            padding: 8px;
                        }
                        
                        .n8n-chat-widget .category-btn {
                            padding: 10px 16px;
                            font-size: 14px;
                        }
                        
                        .n8n-chat-widget .navigation-container {
                            padding: 12px;
                        }
                    }
                    
                    /* Responsive per pantalles grans */
                    @media (min-height: 850px) {
                        .n8n-chat-widget .chat-messages {
                            padding: 20px;
                            padding-bottom: calc(90px + env(safe-area-inset-bottom));
                            height: calc(100vh - 90px);
                            height: calc(100dvh - 90px);
                        }
                        
                        .n8n-chat-widget .navigation-container {
                            padding: 24px;
                        }
                    }
                }
                
                /* ==================== UTILITATS ==================== */
                
                .n8n-chat-widget [aria-hidden="true"] {
                    display: none !important;
                }
                
                .n8n-chat-widget .visually-hidden {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border-width: 0;
                }
                
                /* Scrollbar personalitzat */
                .n8n-chat-widget .chat-messages::-webkit-scrollbar {
                    width: 6px;
                }
                
                .n8n-chat-widget .chat-messages::-webkit-scrollbar-track {
                    background: rgba(133, 79, 255, 0.05);
                }
                
                .n8n-chat-widget .chat-messages::-webkit-scrollbar-thumb {
                    background: rgba(133, 79, 255, 0.2);
                    border-radius: 3px;
                }
                
                .n8n-chat-widget .chat-messages::-webkit-scrollbar-thumb:hover {
                    background: rgba(133, 79, 255, 0.3);
                }
            `;
        }
    }

    // ==================== INICIALITZACIÓ ====================
    
    // Esperar que el DOM estigui llest
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.aranChatWidget = new AranChatWidget(window.ChatWidgetConfig);
        });
    } else {
        window.aranChatWidget = new AranChatWidget(window.ChatWidgetConfig);
    }
    
})();
