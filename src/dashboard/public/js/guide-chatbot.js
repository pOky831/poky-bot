/**
 * pOky AI Guide Chatbot v2
 * Smart rule-based assistant with fuzzy matching, context memory,
 * confidence scoring, multi-intent detection & dynamic follow-ups.
 * Answers questions about all dashboard features in German.
 */

(function () {
  'use strict';

  var isOpen = false;
  var isTyping = false;

  // ══════════════════════════════════════════════
  // Conversation State (context memory)
  // ══════════════════════════════════════════════

  var conversation = {
    lastTopic: null,
    lastQuestion: null,
    questionCount: 0,
    topicsDiscussed: {}
  };

  // ══════════════════════════════════════════════
  // Knowledge Base
  // ══════════════════════════════════════════════

  var knowledge = {
    overview: {
      id: 'overview',
      keywords: ['übersicht', 'overview', 'startseite', 'dashboard', 'statistik', 'statistiken',
        'stats', 'einstellungen', 'module', 'modul-status', 'was zeigt', 'was sehe ich',
        'hauptseite', 'hauptübersicht', 'dashboard übersicht', 'server stats'],
      response: '📊 **Übersicht-Tab**\n\nDer Übersicht-Tab zeigt dir auf einen Blick:\n\n🔹 **4 Statistikkarten** – Mod-Aktionen, Tickets gesamt, offene Tickets & Level-Rollen\n🔹 **Einstellungen** – Willkommenskanal, Ticket-Kategorie, Mod-Rolle & Level-Up-Kanal\n🔹 **Modul-Status** – Ob Auto-Mod, Ticket-Panel, Leveling aktiv sind & wie viele Bad Words gespeichert sind\n\nAlle Zahlen werden animiert hochgezählt, wenn du den Tab öffnest. ✨',
      followups: [
        { label: '📈 Leveling', q: 'Wie funktioniert das Leveling-System?' },
        { label: '🛡️ Auto-Mod', q: 'Was kann der Auto-Mod?' }
      ]
    },

    tickets: {
      id: 'tickets',
      keywords: ['ticket', 'tickets', 'support', 'panel', 'ticket-panel', 'ticket-system',
        'support-rolle', 'ticket-verlauf', 'ticket schließen', 'ticket erstellen',
        'wie ticket', 'supporter', 'ticket kategorie', 'ticket kanal'],
      response: '🎫 **Ticket-System**\n\nDas Ticket-System erlaubt Nutzern, private Support-Kanäle zu erstellen:\n\n🔹 **Panel einrichten:** Wähle einen Kanal → Anzahl Optionen → Namen vergeben → "Panel senden"\n🔹 **Supporter-Rollen:** Diese Rollen sehen automatisch alle Ticket-Kanäle\n🔹 **Ticket-Verlauf:** Klicke auf eine Zeile in der Ticket-Tabelle, um den Chat-Verlauf zu sehen (inkl. Nachrichten, Embeds & Anhänge)\n🔹 **Close-System:** Beim Schließen eines Tickets wird nach einem Grund gefragt & ein Transkript im Log-Kanal gespeichert\n\n⚡ Tipp: Das Panel wird als Dropdown-Menü (Select Menu) im gewählten Kanal angezeigt.',
      followups: [
        { label: '⚙️ Einstellungen', q: 'Wie konfiguriere ich die Einstellungen?' },
        { label: '📋 Mod-Logs', q: 'Was sind Mod-Logs?' }
      ]
    },

    leveling: {
      id: 'leveling',
      keywords: ['level', 'leveling', 'xp', 'level-up', 'level-rollen', 'rang', 'ränge',
        'leaderboard', 'erfahrung', 'aufstieg', 'level system', 'wie level',
        'level aufstieg', 'xp sammeln', 'leveln'],
      response: '📈 **Leveling-System**\n\nNutzer sammeln XP durch Chat-Nachrichten (60s Cooldown zwischen Nachrichten).\n\n🔹 **Level-Up Kanal:** Hier werden Level-Aufstiege verkündet (z. B. "@User ist auf Level 5 aufgestiegen!")\n🔹 **Level-Rollen:** Vergib automatisch Rollen bei bestimmten Levels (z. B. Rolle "Profi" ab Level 10)\n🔹 **Rollen verwalten:** Level + Rollen-ID eingeben → "+" klicken → Rolle wird beim Erreichen des Levels automatisch vergeben\n\n💡 Tipp: Level-Rollen werden beim nächsten Level-Up des Nutzers vergeben, nicht sofort.',
      followups: [
        { label: '🛡️ Auto-Mod', q: 'Wie richte ich Auto-Mod ein?' },
        { label: '👥 Mitglieder', q: 'Wie verwalte ich Mitglieder?' }
      ]
    },

    automod: {
      id: 'automod',
      keywords: ['automod', 'auto-mod', 'auto mod', 'spam', 'bad words', 'schimpfwörter',
        'wörter', 'link-filter', 'links', 'mention', 'erwähnungen', 'filter',
        'moderation automatisch', 'wie automod', 'spam schutz', 'schimpfwort filter',
        'wortfilter', 'bad word', 'blacklist'],
      response: '🛡️ **Auto-Mod**\n\nDer Auto-Mod schützt deinen Server automatisch:\n\n🔹 **Anti-Spam:** Blockiert zu viele Nachrichten in kurzer Zeit (einstellbare Schwelle pro 5 Sekunden)\n🔹 **Link-Filter:** Löscht Nachrichten mit Links (z. B. Discord-Einladungen, URLs)\n🔹 **Mention-Cap:** Begrenzt die Anzahl erlaubter @Erwähnungen pro Nachricht\n🔹 **Bad Words:** Definiere verbotene Wörter – Nachrichten damit werden gelöscht\n\n⚡ Alle Einstellungen werden sofort gespeichert und greifen in Echtzeit.',
      followups: [
        { label: '📈 Leveling', q: 'Wie funktioniert das Leveling?' },
        { label: '⚠️ Verwarnungen', q: 'Wie funktioniert das Warnsystem?' }
      ]
    },

    giveaways: {
      id: 'giveaways',
      keywords: ['giveaway', 'giveaways', 'verlosung', 'gewinnspiel', 'giveaway starten',
        'giveaway erstellen', 'wie giveaway', 'teilnehmer', 'preis', 'gewinn',
        'verlosen', 'giveaway gewinner', 'reroll'],
      response: '🎉 **Giveaways**\n\nSo erstellst und verwaltest du Giveaways:\n\n🔹 **Starten:** Nutze `/giveaway start` auf Discord (Preis, Dauer, Gewinner-Anzahl)\n🔹 **Dashboard-Ansicht:** Sieh alle Giveaways mit Status (Aktiv/Beendet), Teilnehmern und Gewinnern\n🔹 **Auto-Ende:** Der Bot zieht automatisch Gewinner, wenn die Zeit abläuft\n🔹 **Reroll:** Mit `/giveaway reroll` kannst du neue Gewinner ziehen\n\n💡 Tipp: Aktive Giveaways zeigen einen Live-Countdown im Embed.',
      followups: [
        { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' },
        { label: '📊 Übersicht', q: 'Was zeigt die Übersicht?' }
      ]
    },

    warns: {
      id: 'warns',
      keywords: ['warn', 'verwarnung', 'verwarnen', 'warns', 'strike', 'warnsystem',
        'warn entfernen', 'warn löschen', 'wie verwarnen', 'strikes', 'verwarnt',
        'warn-system', '3 strikes', 'warnstufe'],
      response: '⚠️ **Warnsystem**\n\nDas 3-Strike-System funktioniert so:\n\n🔹 **1. Verwarnung:** Nutzer bekommt die Rolle **1-Warn**\n🔹 **2. Verwarnung:** Rolle wechselt zu **2-Warn**\n🔹 **3. Verwarnung:** Rolle wechselt zu **3-Warn**\n🔹 **4. Verwarnung:** 🚨 2 Wochen Timeout!\n\n📋 **Verwarnungen verwalten:**\n• Im Mitglieder-Tab → Mitglied auswählen → "⚠️ Verwarnen" klicken\n• Grund eingeben → Abschicken\n• Verwarnungen können mit dem 🗑️-Button auch wieder gelöscht werden\n\n💡 Die Warn-Rollen werden automatisch vom Bot verwaltet.',
      followups: [
        { label: '👥 Mitglieder', q: 'Wie verwalte ich Mitglieder?' },
        { label: '⏱️ Timeout', q: 'Wie funktioniert der Timeout?' }
      ]
    },

    members: {
      id: 'members',
      keywords: ['mitglied', 'mitglieder', 'member', 'user', 'nutzer', 'mitgliederliste',
        'mitglied suchen', 'mitglied details', 'timeout', 'notiz', 'notizen',
        'wie mitglied', 'mitglieder verwalten', 'user verwalten', 'profil'],
      response: '👥 **Mitglieder-Tab**\n\nDer Mitglieder-Tab gibt dir volle Kontrolle über deine Server-Mitglieder:\n\n🔹 **Suche:** Durchsuche alle Mitglieder nach Name oder Tag\n🔹 **Detailansicht:** Klicke auf ein Mitglied für:\n  • Profilinfo (Avatar, ID, Rollen)\n  • Verwarnungen & Notizen\n  • Mod-Logs (letzte 20 Aktionen)\n🔹 **Aktionen:**\n  • ⚠️ **Verwarnen** – mit Grund & automatischer Rollenvergabe\n  • ⏱️ **Timeout** – 1 Min bis 1 Monat, mit Grund\n  • 📝 **Notizen** – interne Notizen (bearbeitbar, löschbar)\n  • ✅ **Timeout aufheben** – falls aktiv\n\n⚡ Alle Änderungen werden live auf dem Discord-Server umgesetzt.',
      followups: [
        { label: '⚠️ Verwarnungen', q: 'Wie funktioniert das Warnsystem?' },
        { label: '📋 Mod-Logs', q: 'Was zeigen die Mod-Logs?' }
      ]
    },

    modlogs: {
      id: 'modlogs',
      keywords: ['modlog', 'mod-logs', 'mod log', 'moderations-log', 'log', 'protokoll',
        'verlauf', 'aktionen', 'history', 'moderation verlauf', 'mod aktion',
        'log kanal', 'wer hat gebannt'],
      response: '📋 **Mod-Logs**\n\nDer Mod-Logs-Tab zeigt alle Moderationsaktionen:\n\n🔹 **Aktionen:** Warn, Kick, Ban, Timeout\n🔹 **Details:** Wer wurde bestraft, von wem, aus welchem Grund, wann?\n🔹 **Badge-Farben:**\n  • 🟡 Gelb = Verwarnung\n  • 🟠 Orange = Kick\n  • 🔴 Rot = Bann\n  • 🩷 Pink = Timeout\n\n💡 Die Logs helfen dir, den Überblick über alle Mod-Aktionen zu behalten.',
      followups: [
        { label: '⚠️ Verwarnungen', q: 'Wie verwarne ich ein Mitglied?' },
        { label: '👥 Mitglieder', q: 'Wie verwalte ich Mitglieder?' }
      ]
    },

    settings: {
      id: 'settings',
      keywords: ['einstellung', 'konfiguration', 'einrichten', 'setup', 'kanal', 'rolle',
        'mod-rolle', 'willkommenskanal', 'ticket-kategorie', 'log-kanal',
        'konfigurieren', 'einrichten wie', 'wie einstellen', 'channel setzen'],
      response: '⚙️ **Einstellungen**\n\nIm Übersicht-Tab siehst du die wichtigsten Einstellungen:\n\n🔹 **Willkommenskanal** – Wo neue Mitglieder begrüßt werden\n🔹 **Ticket-Kategorie** – Kategorie für automatisch erstellte Ticket-Kanäle\n🔹 **Mod-Rolle** – Rolle mit Zugriff auf alle Mod-Funktionen\n🔹 **Level-Up Kanal** – Hier werden Aufstiege verkündet\n\n🔧 **Ändern der Einstellungen:**\n• Die meisten Einstellungen werden über Discord-Slash-Commands gesetzt (z. B. `/welcome channel`, `/ticket setup`)\n• Ticket-Panel & Supporter-Rollen direkt hier im Tickets-Tab\n• Leveling & Auto-Mod jeweils in ihren Tabs konfigurierbar',
      followups: [
        { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' },
        { label: '📈 Leveling', q: 'Wie richte ich Leveling ein?' }
      ]
    },

    messages: {
      id: 'messages',
      keywords: ['nachricht', 'embed', 'embed senden', 'nachricht senden', 'embed nachricht',
        'ankündigung', 'announcement', 'broadcast', 'benachrichtigung'],
      response: '📨 **Nachrichten-Tab**\n\nIm Nachrichten-Tab kannst du schöne Embed-Nachrichten erstellen und senden:\n\n🔹 **Kanal wählen** – Wähle aus, in welchen Kanal die Nachricht gesendet wird\n🔹 **Embed gestalten:**\n  • Titel & Beschreibung (mit Markdown)\n  • Farbe über Color-Picker oder Hex-Code\n  • Bild-URL für ein Embed-Bild\n  • Footer-Text für zusätzliche Infos\n🔹 **Vorschau:** Mit "👁️ Vorschau" siehst du, wie das Embed aussehen wird\n🔹 **Senden:** Ein Klick auf "📨 Senden" und die Nachricht geht raus!\n\n💡 Tipp: Die Embeds unterstützen Discord-Markdown wie **Fett**, *Kursiv* und Links.',
      followups: [
        { label: '🛡️ Auto-Mod', q: 'Was kann der Auto-Mod?' },
        { label: '📊 Übersicht', q: 'Was zeigt die Übersicht?' }
      ]
    },

    general: {
      id: 'general',
      keywords: ['hilfe', 'help', 'was kann', 'funktionen', 'features', 'was macht',
        'wie funktioniert', 'erklärung', 'anleitung', 'guide', 'alle funktionen',
        'was bietet', 'überblick'],
      response: '🌟 **pOky Dashboard – Alle Funktionen**\n\nDas Dashboard hat 8 Tabs:\n\n📊 **Übersicht** – Statistiken & Einstellungen\n📈 **Leveling** – XP-System & Level-Rollen\n🛡️ **Auto-Mod** – Spam-, Link- & Wort-Filter\n🎉 **Giveaways** – Verlosungen verwalten\n🎫 **Tickets** – Support-Ticket-System\n📋 **Mod-Logs** – Moderations-Verlauf\n👥 **Mitglieder** – Mitglieder verwalten\n📨 **Nachrichten** – Embed-Nachrichten senden\n\nStell mir eine Frage zu einem bestimmten Tab – z. B. "Wie funktionieren Tickets?" oder "Was macht der Auto-Mod?" 👇',
      followups: [
        { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' },
        { label: '📈 Leveling', q: 'Wie richte ich Leveling ein?' },
        { label: '🛡️ Auto-Mod', q: 'Was kann der Auto-Mod?' }
      ]
    },

    greetings: {
      id: 'greetings',
      keywords: ['hallo', 'hi', 'hey', 'moin', 'guten tag', 'guten morgen', 'guten abend',
        'servus', 'grüß', 'gruss', 'grüezi', 'ciao', 'yo', 'gude', 'nabend', 'morgen'],
      response: '👋 Hallo! Schön, dass du da bist! 😊\n\nIch bin der pOky-Guide und helfe dir bei allen Fragen zum Dashboard. Frag mich einfach, was du wissen möchtest – z. B. "Wie funktionieren Tickets?" oder "Was kann der Auto-Mod?"',
      followups: [
        { label: '📊 Übersicht', q: 'Was zeigt die Übersicht?' },
        { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' }
      ]
    },

    thanks: {
      id: 'thanks',
      keywords: ['danke', 'dankeschön', 'vielen dank', 'thx', 'thanks', 'merci', 'top',
        'super', 'perfekt', 'nice', 'danke dir', 'dank'],
      response: 'Gern geschehen! 😊 Freut mich, dass ich helfen konnte!\n\nFalls du noch mehr Fragen hast – ich bin hier! 💪',
      followups: null
    },

    goodbye: {
      id: 'goodbye',
      keywords: ['tschüss', 'tschau', 'bye', 'bis bald', 'bis später', 'bis dann',
        'ciao', "mach's gut", 'machs gut', 'wiedersehen', 'ade'],
      response: '👋 Tschüss! Bis zum nächsten Mal!\n\nFalls du später noch Fragen hast, ich bin immer hier unten rechts. 😊',
      followups: null
    },

    howareyou: {
      id: 'howareyou',
      keywords: ['wie geht', 'wie gehts', "wie geht's", 'alles klar', 'alles gut',
        'was geht', 'wie läuft', 'wie läufts'],
      response: "Mir geht's blendend! 😄 Ich bin bereit, dir bei allen Dashboard-Fragen zu helfen. Und selbst?",
      followups: null
    },

    whoareyou: {
      id: 'whoareyou',
      keywords: ['wer bist du', 'was bist du', 'wer ist poky', 'bist du ein bot', 'ki',
        'ai', 'assistent', 'chatbot', 'poky guide', 'wer oder was'],
      response: '🤖 Ich bin der **pOky-Guide** – ein smarter KI-Assistent, der dir das pOky-Dashboard erklärt!\n\nIch kenne mich aus mit:\n📊 Übersicht · 🎫 Tickets · 📈 Leveling · 🛡️ Auto-Mod · 🎉 Giveaways · ⚠️ Verwarnungen · 👥 Mitglieder · 📋 Mod-Logs · 📨 Nachrichten\n\nStell mir einfach eine Frage! 👇',
      followups: [
        { label: '📊 Übersicht', q: 'Was zeigt die Übersicht?' },
        { label: '🌟 Alle Features', q: 'Welche Funktionen gibt es?' }
      ]
    },

    funny: {
      id: 'funny',
      keywords: ['witz', 'lustig', 'lach', 'spaß', 'spass', 'funny', 'lol', 'haha',
        'erzähl mal was', 'witz erzähl', 'mich aufheitern'],
      response: '😂 Ein Witz gefällig?\n\nWarum hat der Discord-Bot keine Freunde?\n...\nWeil er immer nur "Befehle" entgegennimmt! 🤖💔\n\nOkay, okay, ich bleib bei meinen Dashboard-Erklärungen... 😅',
      followups: null
    },

    encouragement: {
      id: 'encouragement',
      keywords: ['weiß nicht', 'weiss nicht', 'verstehe nicht', 'keine ahnung', 'schwer',
        'kompliziert', 'problem', 'schwierig', 'verwirrt', 'versteh nicht',
        'hilfe', 'brauche hilfe', 'kannst du helfen'],
      response: 'Keine Sorge! 🫶 Das Dashboard ist am Anfang vielleicht etwas viel, aber ich helfe dir gerne.\n\nSag mir einfach, bei welchem Tab oder welcher Funktion du nicht weiterkommst – z. B. "Wie verwalte ich Mitglieder?" oder "Ich verstehe das Ticket-System nicht".',
      followups: [
        { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' },
        { label: '👥 Mitglieder', q: 'Wie verwalte ich Mitglieder?' },
        { label: '📈 Leveling', q: 'Wie richte ich Leveling ein?' }
      ]
    },

    slashCommands: {
      id: 'slashCommands',
      keywords: ['slash command', 'slash commands', 'befehl', 'befehle', 'command',
        'commands', '/welcome', '/ticket', '/giveaway', '/warn', '/moderation',
        'slash', 'discord befehl', 'bot befehl'],
      response: '🤖 **Discord Slash-Commands**\n\nDer pOky-Bot hat folgende Slash-Commands:\n\n🔹 `/ping` – Bot-Latenz prüfen\n🔹 `/welcome channel` – Willkommenskanal setzen\n🔹 `/ticket setup` – Ticket-System konfigurieren\n🔹 `/ticket close` – Ticket schließen\n🔹 `/giveaway start` – Giveaway erstellen\n🔹 `/giveaway reroll` – Neue Gewinner ziehen\n🔹 `/warn add` – Nutzer verwarnen\n🔹 `/warn remove` – Verwarnung löschen\n🔹 `/moderation kick/ban/timeout` – Moderationsaktionen\n🔹 `/botinfo` – Bot-Informationen anzeigen\n\n💡 Viele Einstellungen kannst du auch bequem hier im Dashboard vornehmen!',
      followups: [
        { label: '🎉 Giveaways', q: 'Wie erstelle ich ein Giveaway?' },
        { label: '⚠️ Verwarnungen', q: 'Wie funktioniert das Warnsystem?' }
      ]
    },

    timeoutInfo: {
      id: 'timeoutInfo',
      keywords: ['timeout', 'time out', 'stumm', 'stummschalten', 'mute', 'timeout dauer',
        'wie timeout', 'timeout aufheben', 'timeouten'],
      response: '⏱️ **Timeout (Stummschaltung)**\n\nMit einem Timeout wird ein Mitglied temporär stummgeschaltet:\n\n🔹 **Dauer:** 1 Minute bis zu 1 Monat\n🔹 **Presets im Dashboard:** 1 Min, 5 Min, 10 Min, 1 Std, 1 Tag, 1 Wo, 2 Wo, 1 Mon\n🔹 **Aufheben:** Timeout vor Ablauf der Zeit aufhebbar\n🔹 **Mod-Log:** Wird als Moderationsaktion geloggt\n\n💡 Timeouts sind eine milde Alternative zum Kick oder Bann.',
      followups: [
        { label: '⚠️ Verwarnungen', q: 'Wie funktioniert das Warnsystem?' },
        { label: '📋 Mod-Logs', q: 'Was zeigen die Mod-Logs?' }
      ]
    }
  };

  // ══════════════════════════════════════════════
  // Fallback responses
  // ══════════════════════════════════════════════

  var fallbackResponses = [
    '🤔 Gute Frage! Ich bin zwar schon ziemlich schlau, aber das übersteigt mein Wissen. Frag mich gern zu diesen Themen:\n\n📊 Übersicht · 🎫 Tickets · 📈 Leveling · 🛡️ Auto-Mod · 🎉 Giveaways · ⚠️ Verwarnungen · 👥 Mitglieder · 📋 Mod-Logs · 📨 Nachrichten\n\nProbier z. B.: "Wie funktioniert das Ticket-System?"',
    '💡 Dazu habe ich leider keine genauen Infos. Aber ich kann dir alles über die 8 Dashboard-Tabs erklären – Übersicht, Leveling, Auto-Mod, Giveaways, Tickets, Mod-Logs, Mitglieder und Nachrichten.\n\nProbier z. B. mal: "Erklär mir das Leveling-System"',
    '👋 Ich bin der pOky-Guide und helfe dir, das Dashboard zu verstehen! Frag mich nach:\n• Ticket-System\n• Leveling\n• Auto-Mod\n• Giveaways\n• Verwarnungen\n• Mitglieder-Verwaltung\n• Embed-Nachrichten',
    '🧐 Hmm, das habe ich nicht ganz verstanden. Aber ich bin sicher, ich kann dir bei Dashboard-Fragen helfen! Versuch es mal mit einem dieser Stichworte: Tickets, Leveling, Auto-Mod, Giveaways, Mitglieder, Warnsystem, Einstellungen.'
  ];

  var lowConfidenceResponses = [
    '🤔 Meinst du vielleicht etwas zu diesen Themen? {topics}\n\nKlick einfach auf einen der Vorschläge oder formulier deine Frage etwas genauer.',
    '🧐 Ich bin mir nicht ganz sicher, was du meinst. Geht es um {topics}?\n\nSchreib mir einfach ein Stichwort oder klick auf einen Vorschlag!'
  ];

  // ══════════════════════════════════════════════
  // NLP Engine
  // ══════════════════════════════════════════════

  /**
   * German stop words to filter out noise
   */
  var STOP_WORDS = [
    'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem',
    'einer', 'eines', 'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'wurde',
    'wurden', 'hat', 'haben', 'hatte', 'hatten', 'kann', 'können', 'konnte',
    'konnten', 'soll', 'sollen', 'sollte', 'muss', 'müssen', 'musste', 'darf',
    'dürfen', 'durfte', 'will', 'wollen', 'wollte', 'würde', 'wie', 'was',
    'wo', 'wann', 'warum', 'wer', 'welche', 'welcher', 'welches', 'und',
    'oder', 'aber', 'auch', 'nur', 'noch', 'schon', 'so', 'da', 'dann',
    'denn', 'doch', 'ja', 'nein', 'nicht', 'kein', 'keine', 'mir', 'mich',
    'dir', 'dich', 'ihm', 'ihn', 'ihr', 'uns', 'euch', 'ihnen', 'mein',
    'dein', 'sein', 'unser', 'euer', 'auf', 'an', 'in', 'im', 'von', 'vom',
    'zu', 'zum', 'zur', 'bei', 'mit', 'nach', 'vor', 'über', 'unter',
    'zwischen', 'für', 'gegen', 'ohne', 'durch', 'aus', 'um', 'am', 'bis',
    'etwas', 'alles', 'bitte', 'mal', 'einfach', 'kurz', 'gerne', 'gern',
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'man', 'meine', 'deine'
  ];

  /**
   * Normalize a word: lowercase, remove common suffixes (crude stemming)
   */
  function normalizeWord(w) {
    w = w.toLowerCase();
    // Remove common German/English suffixes (crude but effective)
    if (w.length > 5) {
      if (w.endsWith('ungen')) w = w.slice(0, -5);       // Einstellungen → Einstell
      else if (w.endsWith('heit')) w = w.slice(0, -4);    // Sicherheit → Sicher
      else if (w.endsWith('keit')) w = w.slice(0, -4);    // Möglichkeit → Möglich
      else if (w.endsWith('tion')) w = w.slice(0, -4);    // Funktion → Funk
      else if (w.endsWith('end')) w = w.slice(0, -3);     // laufend → lauf
      else if (w.endsWith('ung')) w = w.slice(0, -3);     // Einstellung → Einstell
      else if (w.endsWith('ern')) w = w.slice(0, -3);     // steuern → steu
      else if (w.endsWith('eln')) w = w.slice(0, -3);     // handeln → hand
      else if (w.endsWith('en')) w = w.slice(0, -2);      // machen → mach
      else if (w.endsWith('er')) w = w.slice(0, -2);      // Filter → Filt
      else if (w.endsWith('es')) w = w.slice(0, -2);      // Features → Featur
      else if (w.endsWith('s')) w = w.slice(0, -1);       // Tickets → Ticket
    }
    return w;
  }

  /**
   * Tokenize and normalize a query string into meaningful words
   */
  function tokenize(query) {
    var raw = query.toLowerCase().trim();
    // Split on spaces and punctuation
    var tokens = raw.split(/[\s,;:.!?()\[\]{}"']+/).filter(Boolean);
    var result = [];
    tokens.forEach(function (t) {
      if (STOP_WORDS.indexOf(t) === -1 && t.length > 1) {
        result.push(normalizeWord(t));
      }
    });
    return result;
  }

  /**
   * Levenshtein (edit) distance between two strings
   */
  function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    var matrix = [];
    for (var i = 0; i <= b.length; i++) matrix[i] = [i];
    for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (i = 1; i <= b.length; i++) {
      for (j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Fuzzy match: returns true if word matches keyword with tolerance for typos.
   * Short words (<=4 chars): exact match only.
   * Longer words: allow up to ~25% edit distance.
   */
  function fuzzyMatch(word, keyword) {
    var w = normalizeWord(word);
    var k = normalizeWord(keyword);
    if (w === k) return true;
    if (w.length <= 3 && k.length <= 3) return false;

    // Prefix match (e.g. "ticket" matches "tickets", "level" matches "leveling")
    if (k.indexOf(w) === 0 || w.indexOf(k) === 0) return true;

    // Levenshtein for medium-long words
    var maxLen = Math.max(w.length, k.length);
    if (maxLen > 4) {
      var dist = levenshtein(w, k);
      var threshold = maxLen <= 5 ? 1 : Math.floor(maxLen * 0.3);
      return dist <= threshold;
    }
    return false;
  }

  /**
   * Score a query against a knowledge entry.
   * Returns { score, matches, exactMatches } where score is a weighted sum.
   */
  function scoreEntry(query, entry) {
    var tokens = tokenize(query);
    var score = 0;
    var matches = [];
    var exactCount = 0;

    entry.keywords.forEach(function (kw) {
      var kwTokens = tokenize(kw);
      // Check if any query token matches any keyword token
      tokens.forEach(function (qt) {
        kwTokens.forEach(function (kt) {
          if (fuzzyMatch(qt, kt)) {
            var weight = kt.length; // longer keyword = more specific
            // Bonus for exact match
            if (qt === kt) {
              weight *= 2;
              exactCount++;
            }
            // Bonus for multi-word keyword matching
            if (kwTokens.length > 1) weight *= 1.5;
            score += weight;
            if (matches.indexOf(kw) === -1) matches.push(kw);
          }
        });
      });
    });

    return { score: score, matches: matches, exactMatches: exactCount, entry: entry };
  }

  /**
   * Find best matching knowledge entry with confidence.
   */
  function findBestMatch(query) {
    var results = [];
    var q = query.toLowerCase().trim();

    Object.keys(knowledge).forEach(function (key) {
      var entry = knowledge[key];
      var result = scoreEntry(q, entry);
      if (result.score > 0) {
        results.push(result);
      }
    });

    // Sort by score descending
    results.sort(function (a, b) { return b.score - a.score; });

    if (results.length === 0) {
      return { entry: null, confidence: 0, allResults: [] };
    }

    var best = results[0];
    var secondBest = results.length > 1 ? results[1] : null;

    // Calculate confidence (0-100)
    var confidence = 0;
    if (best.exactMatches >= 3) {
      confidence = 95;
    } else if (best.exactMatches >= 2) {
      confidence = 85;
    } else if (best.exactMatches >= 1) {
      confidence = 70;
    } else if (best.score > 15) {
      confidence = 55;
    } else if (best.score > 8) {
      confidence = 35;
    } else {
      confidence = 20;
    }

    // If second best is very close, reduce confidence (ambiguity)
    if (secondBest && secondBest.score > best.score * 0.7) {
      confidence = Math.min(confidence, 45);
    }

    return {
      entry: best.entry,
      confidence: confidence,
      allResults: results.slice(0, 3)
    };
  }

  /**
   * Detect if query has multiple intents (split by "und", ",", "oder", "?" etc.)
   */
  function splitIntents(query) {
    var parts = query.split(/\s+(?:und|oder|sowie|außerdem|zudem|auch)\s+|\?\s*|,\s*/i);
    var meaningful = parts.filter(function (p) { return p.trim().length > 5; });
    if (meaningful.length <= 1) return [query];
    return meaningful;
  }

  // ══════════════════════════════════════════════
  // Main Query Processing
  // ══════════════════════════════════════════════

  function processQuery(query) {
    var q = query.toLowerCase().trim();
    var response = '';
    var followups = null;

    // Handle empty queries
    if (!q || q.length < 2) {
      return {
        text: '👋 Schreib mir einfach eine Frage zum Dashboard! Oder klick auf einen der Vorschläge unten. 😊',
        followups: [
          { label: '📊 Übersicht', q: 'Was zeigt die Übersicht?' },
          { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' },
          { label: '📈 Leveling', q: 'Wie richte ich Leveling ein?' }
        ]
      };
    }

    // Run main matching first (always)
    var match = findBestMatch(q);

    // Handle follow-up context: if the user asks a contextual follow-up AND
    // normal matching didn't find a high-confidence result for a DIFFERENT topic,
    // then respond based on the last topic.
    if (isContextualFollowup(q) && conversation.lastTopic) {
      // If normal matching found a different topic with confidence >= 50, use it instead
      var normalTopicId = match.entry ? match.entry.id : null;
      if (!normalTopicId || normalTopicId === conversation.lastTopic || match.confidence < 50) {
        var contextualAnswer = handleContextualFollowup(q, conversation.lastTopic);
        if (contextualAnswer) return contextualAnswer;
      }
    }

    // Try multi-intent detection
    var intents = splitIntents(query);
    if (intents.length > 1) {
      var multiResponse = handleMultiIntent(intents);
      if (multiResponse) return multiResponse;
    }

    if (match.entry && match.confidence >= 50) {
      // High confidence - direct answer
      response = match.entry.response;
      followups = match.entry.followups;
      conversation.lastTopic = match.entry.id;
    } else if (match.entry && match.confidence >= 25) {
      // Medium confidence - answer with a small hint of uncertainty
      response = match.entry.response;
      followups = match.entry.followups;
      conversation.lastTopic = match.entry.id;
    } else if (match.allResults.length > 0) {
      // Low confidence - suggest closest topics
      var topicNames = match.allResults.map(function (r) {
        var nameMap = {
          'overview': '📊 Übersicht',
          'tickets': '🎫 Tickets',
          'leveling': '📈 Leveling',
          'automod': '🛡️ Auto-Mod',
          'giveaways': '🎉 Giveaways',
          'warns': '⚠️ Verwarnungen',
          'members': '👥 Mitglieder',
          'modlogs': '📋 Mod-Logs',
          'settings': '⚙️ Einstellungen',
          'messages': '📨 Nachrichten',
          'general': '🌟 Allgemein',
          'greetings': '👋 Begrüßung',
          'whoareyou': '🤖 Über mich',
          'slashCommands': '🤖 Commands',
          'timeoutInfo': '⏱️ Timeout'
        };
        return nameMap[r.entry.id] || r.entry.id;
      });

      var template = lowConfidenceResponses[Math.floor(Math.random() * lowConfidenceResponses.length)];
      response = template.replace('{topics}', topicNames.slice(0, 3).join(', ') + '?');

      // Build followup suggestions from top results
      followups = [];
      match.allResults.slice(0, 3).forEach(function (r) {
        if (r.entry.followups && r.entry.followups.length > 0) {
          followups.push(r.entry.followups[0]);
        }
      });
      if (followups.length === 0) {
        followups = [
          { label: '📊 Übersicht', q: 'Was zeigt die Übersicht?' },
          { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' }
        ];
      }
    } else {
      // No match at all - use fallback
      response = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
      followups = [
        { label: '📊 Übersicht', q: 'Was zeigt die Übersicht?' },
        { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' },
        { label: '📈 Leveling', q: 'Wie richte ich Leveling ein?' }
      ];
      conversation.lastTopic = null;
    }

    conversation.lastQuestion = q;
    conversation.questionCount++;

    if (conversation.lastTopic) {
      conversation.topicsDiscussed[conversation.lastTopic] =
        (conversation.topicsDiscussed[conversation.lastTopic] || 0) + 1;
    }

    return { text: response, followups: followups };
  }

  /**
   * Detect if a query is a contextual follow-up (referring to previous topic)
   */
  function isContextualFollowup(q) {
    var followupPatterns = [
      'wie geht das', 'wie mach ich das', 'wie mache ich das', 'wie geht es',
      'wie richte ich das ein', 'wie stell ich das ein', 'wie funktioniert das',
      'erklär das', 'erklär mir das', 'erkläre das', 'was ist das',
      'und wie', 'und dann', 'was noch', 'erzähl mehr', 'mehr dazu',
      'details', 'genauer', 'wie genau', 'das versteh ich nicht',
      'nochmal', 'noch mal', 'kannst du das erklären', 'wie meinst du das',
      'wie soll das gehen', 'was bringt das', 'wofür ist das',
      'how does that work', 'how do i set that up', 'tell me more',
      'was bedeutet das', 'wie benutzt man das', 'wie verwendet man das'
    ];
    for (var i = 0; i < followupPatterns.length; i++) {
      if (q.indexOf(followupPatterns[i]) !== -1) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════
  // Follow-up detail responses (keyed by topic ID)
  // ══════════════════════════════════════════════

  var MORE_DETAIL = {
    'overview': '📊 Mehr zur **Übersicht**:\n\nNeben den Statistikkarten siehst du auch den Modul-Status – grüne Punkte zeigen dir sofort, was aktiv ist. Die Einstellungen lassen sich teils direkt im Dashboard, teils über Discord-Commands ändern.\n\n🔹 **Mod-Log Kanal ändern:** Wähle einfach einen Kanal im Dropdown – wird sofort gespeichert!\n🔹 **Statistiken:** Die Zahlen werden live vom Bot aktualisiert.',
    'tickets': '🎫 Mehr zu **Tickets**:\n\nDas Panel wird als Discord Select-Menu dargestellt. Wenn ein Nutzer eine Option auswählt, erstellt der Bot automatisch einen privaten Kanal in der Ticket-Kategorie.\n\n🔹 **Supporter-Rollen** sehen ALLE Ticket-Kanäle\n🔹 **Ticket-Verlauf:** Einfach auf eine Zeile klicken – du siehst alle Nachrichten inkl. Embeds & Anhänge\n🔹 **Beim Schließen:** Grund angeben → Transkript wird im Log-Kanal gespeichert',
    'leveling': '📈 Mehr zum **Leveling**:\n\nDie XP-Formel ist: `100 × Level^1.5` XP pro Level. Nach jeder Nachricht gibt es 15-25 XP (60s Cooldown).\n\n🔹 **Level-Rollen** werden beim nächsten Aufstieg vergeben\n🔹 **Level-Up Kanal:** Bekommt eine schöne Embed-Nachricht mit dem neuen Level\n🔹 **Leaderboard:** Im Backend berechnet, aktuell nicht im Dashboard sichtbar',
    'automod': '🛡️ Mehr zum **Auto-Mod**:\n\nAlle Filter arbeiten in Echtzeit:\n\n🔹 **Anti-Spam:** Zählt Nachrichten in einem 5-Sekunden-Fenster\n🔹 **Link-Filter:** Erkennt Discord-Einladungen, URLs etc.\n🔹 **Bad Words:** Case-insensitive, erkennt auch Wort-Variationen\n🔹 **Mention-Cap:** Zählt @everyone, @here & Rollen-Erwähnungen mit',
    'giveaways': '🎉 Mehr zu **Giveaways**:\n\nStarte Giveaways mit `/giveaway start <preis> <dauer> <gewinner>`. Der Bot managed automatisch:\n\n🔹 Teilnehmer über Reaktionen\n🔹 Zufällige Gewinnerauswahl\n🔹 Live-Countdown im Embed\n🔹 Reroll mit `/giveaway reroll`',
    'warns': '⚠️ Mehr zum **Warnsystem**:\n\nJede Verwarnung wird im Mod-Log festgehalten. Das 3-Strike-System ist automatisch:\n\n🔹 Rollen 1-Warn, 2-Warn, 3-Warn werden vom Bot erstellt & verwaltet\n🔹 Bei der 4. Verwarnung: automatischer 2-Wochen-Timeout\n🔹 Verwarnungen können im Dashboard mit 🗑️ gelöscht werden',
    'members': '👥 Mehr zu **Mitgliedern**:\n\nDie Mitgliedersuche durchsucht Name & Tag in Echtzeit. In der Detailansicht:\n\n🔹 Avatar, Rollen, Account-Alter\n🔹 Verwarnungen mit Lösch-Button\n🔹 Notizen mit Bearbeitungs-Funktion\n🔹 Mod-Logs der letzten 20 Aktionen\n🔹 Direkt-Buttons für Verwarnen, Timeout, Notiz',
    'modlogs': '📋 Mehr zu **Mod-Logs**:\n\nJede Moderationsaktion wird automatisch geloggt:\n\n🔹 Wer wurde bestraft?\n🔹 Von welchem Moderator?\n🔹 Aus welchem Grund?\n🔹 Wann genau?\n\n💡 Die Badge-Farben (Gelb/Orange/Rot/Pink) zeigen auf einen Blick die Art der Aktion.',
    'settings': '⚙️ Mehr zu **Einstellungen**:\n\nDie Einstellungen sind auf zwei Wege änderbar:\n\n🔹 **Dashboard:** Mod-Log Kanal direkt im Übersicht-Tab, Ticket-Panel im Tickets-Tab\n🔹 **Slash-Commands:** `/welcome channel`, `/ticket setup`, etc.\n\n💡 Änderungen im Dashboard werden sofort auf den Discord-Server übertragen.',
    'messages': '📨 Mehr zu **Nachrichten**:\n\nDer Embed-Builder ist perfekt für:\n\n🔹 Ankündigungen\n🔹 Regel-Embeds\n🔹 Event-Infos\n\n💡 Du kannst auch Bilder einbetten und die Farbe per Color-Picker oder Hex-Code wählen.',
    'slashCommands': '🤖 Mehr zu **Slash-Commands**:\n\nAlle Commands haben Autovervollständigung in Discord. Einfach `/` tippen und pOky auswählen!\n\nDie wichtigsten:\n🔹 `/giveaway start` – mit Preis, Dauer, Gewinnerzahl\n🔹 `/warn add @user Grund` – direkt vom Chat aus\n🔹 `/moderation ban @user Grund` – mit automatischem Log-Eintrag',
    'general': '🌟 Mehr zu den **Funktionen**:\n\nJeder der 8 Tabs hat seinen eigenen Zweck. Die wichtigsten Workflows:\n\n🔹 **Moderation:** Mitglieder-Tab → Verwarnen/Timeout → Mod-Logs\n🔹 **Community:** Leveling + Giveaways für Engagement\n🔹 **Support:** Tickets-Tab → Panel einrichten → Supporter-Rollen\n\n💡 Alle Tabs arbeiten zusammen – Änderungen wirken sofort auf dem Discord-Server!',
    'whoareyou': '🤖 Nochmal zu mir:\n\nIch bin der **pOky-Guide**, dein Dashboard-Assistent! Ich bin zwar keine echte KI, aber mit meiner smarten Suchlogik finde ich die richtigen Antworten zu all deinen Dashboard-Fragen.\n\nFrag mich ruhig alles – ich beiße nicht! 😊',
    'timeoutInfo': '⏱️ Mehr zum **Timeout**:\n\nTechnisch gesehen ist ein Timeout Discord\'s "Communication Disabled"-Feature. Der Nutzer kann in dieser Zeit:\n\n🔹 Keine Nachrichten senden\n🔹 Nicht in Voice-Kanälen sprechen\n🔹 Keine Reaktionen hinzufügen\n\n💡 Timeouts sind zeitlich begrenzt – für dauerhafte Stummschaltung bräuchtest du eine spezielle Rolle.',
    'encouragement': '💪 **Lass dich nicht entmutigen!**\n\nDas Dashboard ist wirklich nicht kompliziert, wenn man es einmal verstanden hat. Hier mein Tipp:\n\n🔹 Fang mit dem **Übersicht-Tab** an – da siehst du alles auf einen Blick\n🔹 Dann schau dir **Tickets** oder **Leveling** an – je nachdem, was du brauchst\n🔹 Der Rest ergibt sich von selbst!\n\nWobei kann ich dir konkret helfen? 😊'
  };

  /**
   * Handle a contextual follow-up question by using the last topic
   */
  function handleContextualFollowup(q, lastTopicId) {
    var entry = null;
    Object.keys(knowledge).forEach(function (k) {
      if (knowledge[k].id === lastTopicId) entry = knowledge[k];
    });
    if (!entry || lastTopicId === 'greetings' || lastTopicId === 'thanks' ||
        lastTopicId === 'goodbye' || lastTopicId === 'howareyou' ||
        lastTopicId === 'funny') {
      return null;
    }

    var detail = MORE_DETAIL[lastTopicId];
    if (detail) {
      return {
        text: detail,
        followups: entry.followups
      };
    }

    // If no specific detail, just repeat the entry
    return {
      text: entry.response,
      followups: entry.followups
    };
  }

  /**
   * Handle multi-intent queries by answering each sub-question
   */
  function handleMultiIntent(intents) {
    if (intents.length > 3) return null; // Too many, fall back to normal matching

    var responses = [];
    intents.forEach(function (intent) {
      var match = findBestMatch(intent.trim());
      if (match.entry && match.confidence >= 40) {
        responses.push({
          topic: match.entry.id,
          short: extractShortAnswer(match.entry)
        });
      }
    });

    if (responses.length >= 2) {
      var text = '🤓 **Mehrere Themen auf einmal – hier die Kurzfassung:**\n\n';
      responses.forEach(function (r, i) {
        text += r.short;
        if (i < responses.length - 1) text += '\n\n' + '─'.repeat(30) + '\n\n';
      });
      conversation.lastTopic = responses[responses.length - 1].topic;
      return {
        text: text,
        followups: [
          { label: '📊 Übersicht', q: 'Was zeigt die Übersicht?' },
          { label: '🎫 Tickets', q: 'Wie funktioniert das Ticket-System?' }
        ]
      };
    }

    return null;
  }

  /**
   * Extract a short 2-3 line answer from a knowledge entry
   */
  function extractShortAnswer(entry) {
    var lines = entry.response.split('\n');
    var header = lines[0] || '';
    var bodyLines = [];
    for (var i = 1; i < lines.length; i++) {
      if (lines[i].trim() && bodyLines.length < 3) {
        bodyLines.push(lines[i].trim());
      }
    }
    return header + '\n' + bodyLines.join('\n');
  }

  // ══════════════════════════════════════════════
  // Utility
  // ══════════════════════════════════════════════

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ══════════════════════════════════════════════
  // UI Functions
  // ══════════════════════════════════════════════

  window.toggleGuideChat = function () {
    isOpen = !isOpen;
    var chatbot = document.getElementById('guide-chatbot');
    if (isOpen) {
      chatbot.classList.add('open');
      document.getElementById('guide-chat-input').focus();
      scrollToBottom();
    } else {
      chatbot.classList.remove('open');
    }
  };

  window.askGuide = function (question) {
    if (!question || isTyping) return;

    // Add user message (escape to prevent XSS)
    addMessage(question, 'user');

    // Show typing
    showTyping();

    // Process query and respond
    setTimeout(function () {
      var result = processQuery(question);
      hideTyping();
      addMessage(result.text, 'bot');

      // Update quick action buttons dynamically
      if (result.followups && result.followups.length > 0) {
        updateQuickActions(result.followups);
      }
    }, 500 + Math.random() * 600);
  };

  window.sendGuideMessage = function () {
    var input = document.getElementById('guide-chat-input');
    var text = input.value.trim();
    if (!text || isTyping) return;
    input.value = '';
    askGuide(text);
  };

  function addMessage(text, sender) {
    var container = document.getElementById('guide-chat-messages');
    var div = document.createElement('div');
    div.className = 'guide-msg guide-msg-' + sender;
    // Escape user messages to prevent XSS; bot responses are from static knowledge base
    var safeText = sender === 'user' ? escapeHtml(text) : text;
    div.innerHTML = '<div class="guide-msg-bubble">' + formatText(safeText) + '</div>';
    container.appendChild(div);
    scrollToBottom();
  }

  function formatText(text) {
    // Bold: **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code: `text`
    text = text.replace(/`(.+?)`/g, '<code style="background:rgba(255,94,138,0.12);color:var(--pink-light);padding:1px 6px;border-radius:4px;font-size:12px">$1</code>');
    return text;
  }

  function updateQuickActions(suggestions) {
    var container = document.getElementById('guide-quick-actions');
    if (!container) return;

    // Fade out old buttons
    container.style.opacity = '0';
    container.style.transform = 'translateY(6px)';

    setTimeout(function () {
      container.innerHTML = '';
      suggestions.forEach(function (s) {
        var btn = document.createElement('button');
        btn.className = 'guide-quick-btn';
        btn.textContent = s.label;
        btn.onclick = function () { askGuide(s.q); };
        container.appendChild(btn);
      });

      // Fade in new buttons
      requestAnimationFrame(function () {
        container.style.opacity = '1';
        container.style.transform = 'translateY(0)';
      });
    }, 200);
  }

  function showTyping() {
    isTyping = true;
    document.getElementById('guide-chat-typing').classList.add('active');
    scrollToBottom();
  }

  function hideTyping() {
    isTyping = false;
    document.getElementById('guide-chat-typing').classList.remove('active');
  }

  function scrollToBottom() {
    var msgs = document.getElementById('guide-chat-messages');
    setTimeout(function () {
      msgs.scrollTop = msgs.scrollHeight;
    }, 50);
  }

  // ══════════════════════════════════════════════
  // Keyboard shortcut: Ctrl+K to toggle chat
  // ══════════════════════════════════════════════

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      toggleGuideChat();
    }
  });

})();
