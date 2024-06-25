const AI_NAME = "Telegram Web OpenAI Integration"
const AI_VERSION = "v1.0"
const AI_DEBUG = true;
var AI_INSTANCE;

function _main() {
    AI_INSTANCE = new AI();
    AI_INSTANCE.init();
}

const AIProtocol = {
    AnswerForMessage: 'AnswerForMessage'
};

const DialogueState = {
    UnRead: 'UnRead',
    UnReadMuted: 'UnReadMuted',
    None: 'None'
};

const MessageType = {
    TextMessage: 'TextMessage',
    VoiceMessage: 'VoiceMessage',
    Photo: 'Photo',
    Sticker: 'Sticker'
};

function AI() {
    this.init = function() {
        this.logger = new AILogger();
        this.parser = new AIParser();

        this.logger.info(`${AI_NAME} ${AI_VERSION}`);
        this.logger.info("Initialising ...");

        this.closeDialogue();
        this.loop();
    }

    this.runAI = function (protocol, data) {
        this.logger.info(`Running AI by protocol '${protocol}'`);
        this.logger.info(data);

        const requestHeaders = new Headers();
        requestHeaders.append("Content-Type", "application/json");
        requestHeaders.append("Authorization", "Bearer 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");

        switch (protocol) {
            case AIProtocol.AnswerForMessage:
                const raw = JSON.stringify({
                    "model": "gpt-3.5-turbo",
                    "messages": data
                });

                const requestOptions = {
                    method: "POST",
                    headers: requestHeaders,
                    body: raw,
                    redirect: "follow"
                };

                fetch("https://api.openai.com/v1/chat/completions", requestOptions)
                    .then((response) => response.json())
                    .then((parsedResponse) => {
                        this.logger.info(parsedResponse);

                        try {
                            const message = parsedResponse.choices[0].message;

                            const role = message.role;
                            const content = message.content;

                            this.printMessageAndSend(content);
                        } catch (exception) {
                            this.logger.error("Failed parse response!");
                            this.logger.error(exception);
                        }
                    })
                    .catch((error) => this.logger.error(error));
                break;
        }
    }

    this.scanDialoguesForJoin = function () {
        this.parser.parseDialogues();
        for (var i = 0; i < this.parser.cachedDialogues.length; i++) {
            const dialogue = this.parser.cachedDialogues[i];

            if (dialogue.shouldJoin()) {
                dialogue.join();
                //setTimeout(function () {
                // ...
                //}, 500);
            }
        }
    }

    this.scanMessagesForAnswer = function () {
        this.parser.parseMessages();
        const lastMessage = this.parser.cachedMessages[this.parser.cachedMessages.length - 1];
        if (lastMessage.isOwn()) {
            this.closeDialogue();
            return;
        }

        var messages = [];
        for (var i = 0; i < this.parser.cachedMessages.length; i++) {
            const message = this.parser.cachedMessages[i];
            messages.push(message.toJsonObject());
        }

        this.runAI(AIProtocol.AnswerForMessage, messages);
    }

    this.loop = () => {
        this.logger.info("Loop tick");
        var isOpenedDialogue = !_isNull(_getFirstByClass(document, 'messages-layout'));
        if (!isOpenedDialogue) {
            this.scanDialoguesForJoin();
        } else {
            this.scanMessagesForAnswer();
        }
        setTimeout(this.loop, 2000);
    }

    this.printMessageAndSend = function(message) {
        const divInput = document.getElementById("editable-message-text");
        divInput.innerHTML = message;
        const inputEvent = new Event('input', {
            bubbles: true,
            cancelable: true
        });
        divInput.dispatchEvent(inputEvent);
        setTimeout(this.sendMessage, 100 + _randomInt(300));
    }

    this.sendMessage = function() {
        document.querySelector('button[title="Send Message"]').click();
    }

    this.closeDialogue = function () {
        window.location.replace('#');
    }
}

function AIParser() {
    this.parseDialogues = function () {
        this.cachedDialogues = [];
        try {
            const chatList = _getFirstByClass(document, 'chat-list');
            const chatItems = _getAllByClass(chatList, 'chat-item-clickable');

            for (var i = 0; i < chatItems.length; i++) {
                const chatItem = chatItems[i];
                const dialogue = new AIDialogue();

                if (!dialogue.tryParse(chatItem)) {
                    continue;
                }
                this.cachedDialogues.push(dialogue);
            }
        } catch (exception) {
            AI_INSTANCE.logger.error("Failed parse dialogues!");
            AI_INSTANCE.logger.error(exception);
        }
    }

    this.parseMessages = function () {
        this.cachedMessages = [];
        try {
            const messagesContainers = document.getElementsByClassName('message-date-group');

            for (var j = 0; j < messagesContainers.length; j++) {
                const messagesContainer = messagesContainers[j];
                const messages = messagesContainer.getElementsByClassName('message-list-item');

                for (var i = 0; i < messages.length; i++) {
                    const messageItem = messages[i];
                    const message = new AIMessage();

                    if (!message.tryParse(messageItem)) {
                        continue;
                    }

                    this.cachedMessages.push(message);
                }
            }
        } catch (exception) {
            AI_INSTANCE.logger.error("Failed parse messages!");
            AI_INSTANCE.logger.error(exception);
        }
    }
}

function AIMessage() {
    var message;
    var own;

    this.tryParse = function (listItem) {
        try {
            const messageContent = listItem.getElementsByClassName('text-content')[0].innerHTML;
            const split = messageContent.split("<");

            message = split[0];
            own = listItem.classList.contains('own');

            if (AI_DEBUG) {
                AI_INSTANCE.logger.info(`Parsed message '${message}', '${own}'`);
            }
        } catch (exception) {
            if (AI_DEBUG) {
                AI_INSTANCE.logger.error("Failed parse message!");
                AI_INSTANCE.logger.error(exception);
            }
            return false;
        }
        return true;
    }

    this.isOwn = function () {
        return own;
    }

    this.toJsonObject = function () {
        const newMessage = { role: own ? 'assistant' : 'user', content: message };
        return newMessage;
    }
}

function AIDialogue() {
    var listItemButton;
    var senderHref;
    var senderName;
    var dialogueState;
    var lastMessageType;

    this.tryParse = function (listItem) {
        try {
            listItemButton = _getFirstByClass(listItem, 'ListItem-button');

            const info = _getFirstByClass(listItemButton, 'info');

            senderHref = listItemButton.getAttribute('href');
            senderName = _getFirstByClass(_getFirstByClass(_getFirstByClass(info, 'info-row'), 'title'), 'fullName').innerHTML;

            const subtitle = _getFirstByClass(info, 'subtitle');

            const lastMessage = _getFirstByClass(subtitle, 'last-message');
            if (lastMessage.innerHTML.includes("Voice message")) {
                lastMessageType = MessageType.VoiceMessage;
            }
            else if (lastMessage.innerHTML.includes("Photo")) {
                lastMessageType = MessageType.Photo;
            }
            else if (lastMessage.innerHTML.includes("Sticker")) {
                lastMessageType = MessageType.Sticker;
            }
            else {
                lastMessageType = MessageType.TextMessage;
            }

            const chatBadgeWrapper = _getFirstByClass(subtitle, 'ChatBadge-transition');

            if (_isNull(chatBadgeWrapper)) {
                dialogueState = DialogueState.None;
            } else {
                const chatBadge = _getFirstByClass(chatBadgeWrapper, 'ChatBadge');
                if (_hasClass(chatBadge, 'unread')) {
                    if (_hasClass(chatBadge, 'muted')) {
                        dialogueState = DialogueState.UnReadMuted;
                    } else {
                        dialogueState = DialogueState.UnRead;
                    }
                } else {
                    dialogueState = DialogueState.None;
                }
            }

            if (AI_DEBUG) {
                AI_INSTANCE.logger.info(`Parsed dialogue '${senderHref}', '${senderName}', '${dialogueState}'`);
            }
        } catch (exception) {
            if (AI_DEBUG) {
                AI_INSTANCE.logger.error("Failed parse dialogue!");
                AI_INSTANCE.logger.error(exception);
            }
            return false;
        }
        return true;
    }

    this.shouldJoin = function () {
        return dialogueState == DialogueState.UnRead && lastMessageType == MessageType.TextMessage;
    }

    this.join = function () {
        AI_INSTANCE.logger.info(`Join to dialogue '${senderHref}'`);
        var event = new MouseEvent('mousedown', {
            view: window,
            bubbles: true,
            cancelable: false
        });
        listItemButton.dispatchEvent(event);
    }
}

function AILogger() {
    var log = function (prefix, content, backgroundColor, fontColor) {
        if (typeof content === 'string') {
            console.log(`%c [${prefix}]: ${content}`, `background: ${backgroundColor}; color: ${fontColor}`);
            return;
        }
        console.log(content);
    }

    this.info = function (content) {
        log("INFO", content, "#FFFFFF", "#000000");
    }

    this.warn = function (content) {
        log("WARNING", content, "#FFFF00", "#000000");
    }

    this.error = function (content) {
        log("ERROR", content, "#FF0000", "#FFFF00");
    }
}

function _getAllByClass(element, className) {
    return element.getElementsByClassName(className);
}

function _getFirstByClass(element, className) {
    return _getAllByClass(element, className)[0];
}

function _isNull(element) {
    return typeof element === 'undefined';
}

function _hasClass(element, className) {
    return element.classList.contains(className);
}

function _randomInt(max) {
    return Math.floor(Math.random() * max);
}
 
_main();