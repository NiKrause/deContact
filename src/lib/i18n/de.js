// Deutsch (#89): dieselben Schlüssel wie en.js. Kurzes UI-Deutsch mit „du“; Passkey, QR-Code
// und DID bleiben stehen (der Passkey, der Relay, der Token, das Secret).
export default {
	app: {
		tagline: '– selbstaktualisierend · lokal · Peer-to-Peer'
	},
	// was Suchmaschinen und Link-Vorschauen lesen (seo.js), und das Bild der Vorschau
	// (scripts/brand/og-image.html): die Seite jeder Sprache hat ihre eigenen
	meta: {
		title: 'deContact – selbstaktualisierend · lokal · Peer-to-Peer',
		description:
			'Das selbstaktualisierende, lokale Peer-to-Peer-Adressbuch. QR-Code scannen, Karten tauschen: Deine Kontakte bleiben von selbst aktuell, ohne einen Server, dem sie gehören.',
		previewDescription: 'QR-Code scannen, Karten tauschen. Deine Kontakte bleiben von selbst aktuell, ohne einen Server, dem sie gehören.',
		imageAlt: 'deContact: zwei Kontaktkarten, die getauscht werden, und die Worte: selbstaktualisierend, lokal, Peer-to-Peer.',
		imageLead: 'selbstaktualisierend ·<br />lokal · Peer-to-Peer',
		noscript: 'Das selbstaktualisierende, lokale Peer-to-Peer-Adressbuch. deContact läuft in deinem Browser und braucht JavaScript.',
		source: 'Quellcode und Dokumentation auf GitHub'
	},
	// was die App über ihren Build sagt (AppInfo.svelte)
	about: {
		version: 'Version {version}',
		published: 'veröffentlicht {date}',
		commit: 'Commit {commit}',
		source: 'Quellcode auf GitHub'
	},
	language: {
		label: 'Sprache',
		en: 'English',
		de: 'Deutsch'
	},
	common: {
		cancel: 'Abbrechen',
		continue: 'Weiter',
		close: 'Schließen',
		ok: 'OK',
		on: 'An',
		off: 'Aus',
		openMenu: 'Menü öffnen',
		closeMenu: 'Menü schließen'
	},
	header: {
		theme: 'Farbschema wechseln',
		peers: {
			none: 'Kein Netzwerk oder Verbindung wird aufgebaut …',
			seed: 'Seed-Node verbunden',
			swarm: 'Schwarm verbunden',
			count: { one: '({count} Peer)', other: '({count} Peers)' }
		}
	},
	tabs: {
		contacts: 'Kontakte',
		myAddress: 'Meine Adresse',
		statistics: 'Statistik',
		settings: 'Einstellungen'
	},
	home: {
		scan: 'Scannen',
		scanLabel: 'Kontaktadresse',
		qrCode: 'QR-Code',
		waiting: 'Warte auf das Handy von {name} …'
	},
	// die Kamera, die den QR-Code eines Kontakts liest (QrScanner.svelte, <qr-scanner>
	// aus @le-space/libp2p-webrtc-qr)
	scanner: {
		label: 'QR-Code eines Kontakts scannen',
		close: 'Schließen',
		unsupported: 'Dieser Browser kann keine Kamera öffnen. Füge die Kontaktadresse stattdessen ins Feld ein.',
		insecure: 'Eine Kamera ist nur auf einer sicheren Seite (https) erlaubt. Füge die Kontaktadresse stattdessen ins Feld ein.',
		denied: 'Die Kamera wurde abgelehnt. Erlaube sie in der Adressleiste und drücke noch einmal auf Scannen.',
		noDevice: 'Keine Kamera hat geantwortet. Falls eine andere App sie benutzt, schließe diese zuerst.',
		starting: 'Kamera wird gestartet …',
		looking: 'Suche einen Code … ruhig halten und etwa das halbe Bild ausfüllen.',
		stillLooking: 'Suche weiter … {attempts} Versuche. Geh etwas näher heran und vermeide Spiegelungen.',
		notContact: 'Das ist kein deContact-Kontakt und keine Einladung.',
		animated: 'Bewegter Code: Teil {received} von {total}. Weiter ruhig halten.',
		animatedUnknown: 'Bewegter Code. Weiter ruhig halten.',
		hint: 'Mit der Kamera scannen, oder eine Kontaktadresse einfügen und auf Scannen drücken'
	},
	toast: {
		success: 'Erledigt',
		warning: 'Hinweis',
		error: 'Fehler',
		close: 'Meldung schließen'
	},
	contacts: {
		name: 'Nachname',
		firstName: 'Vorname',
		search: 'Suchen …',
		clearSearch: 'Suche leeren',
		selectRow: 'Diesen Kontakt unter Meine Adresse öffnen',
		invited: 'eingeladen',
		canceled: 'Anfrage abgelehnt',
		nextPage: 'Nächste Seite',
		previousPage: 'Vorherige Seite',
		page: 'Seite {page}',
		itemRange: {
			one: '{min}–{max} von {total} Eintrag',
			other: '{min}–{max} von {total} Einträgen'
		},
		pageRange: {
			one: 'von {total} Seite',
			other: 'von {total} Seiten'
		}
	},
	form: {
		photo: 'Foto',
		choosePhoto: 'Foto wählen',
		removePhoto: 'Foto entfernen',
		photoProblem: 'Dieses Bild lässt sich nicht verwenden.',
		firstName: 'Vorname',
		firstNamePlaceholder: 'Vorname eingeben …',
		lastName: 'Nachname',
		lastNamePlaceholder: 'Nachname eingeben …',
		street: 'Straße',
		streetPlaceholder: 'Straße eingeben …',
		zipCode: 'PLZ',
		zipCodePlaceholder: 'PLZ eingeben …',
		city: 'Ort',
		cityPlaceholder: 'Ort eingeben …',
		country: 'Land',
		countryPlaceholder: 'Land eingeben …',
		email: 'E-Mail',
		emailPlaceholder: 'E-Mail',
		category: 'Kategorie',
		categories: {
			private: 'Privat',
			business: 'Geschäftlich',
			other: 'Sonstiges'
		},
		own: 'Meine eigene Adresse',
		update: 'Aktualisieren',
		new: 'Neu',
		delete: 'Löschen',
		add: 'Hinzufügen'
	},
	qr: {
		heading: 'Kontakt teilen',
		summaryBoth:
			'Die erste Person, die scannt, bekommt deine Kontaktdaten sofort und kann dir ihre schicken. Der Code gilt 24 Stunden.',
		summaryNow: 'Die erste Person, die scannt, bekommt deine Kontaktdaten sofort. Der Code gilt 24 Stunden.',
		summaryAsk:
			'Nur in deContact scannbar: Die Person schickt dir eine Anfrage, und du entscheidest, ob du deine Kontaktdaten teilst.',
		copyLink: 'Tippe auf den Code, um den Link zu kopieren',
		copyAddress: 'Tippe auf den Code, um die Kontaktadresse zu kopieren',
		mode: 'Deine Kontaktdaten',
		shareNow: 'Sofort teilen',
		letThemAsk: 'Erst anfragen lassen',
		twoWay: 'Auch um ihre Kontaktdaten bitten',
		twoWayHelp: 'Die Person entscheidet, ob sie ihre schickt.'
	},
	request: {
		label: 'deContact-Protokollaktion',
		heading: 'deContact-Kontaktanfrage',
		send: 'Meine Kontaktdaten senden',
		from: 'Von:',
		nameless: 'jemand ohne Namen auf der Karte',
		owner: 'Inhaber:',
		askBack: 'Kontaktdaten von {name} anfordern',
		them: 'dieser Person',
		details: 'Details der Anfrage',
		showDetails: 'Details einblenden',
		hideDetails: 'Details ausblenden',
		command: 'Befehl: {value}',
		recipient: 'Empfänger: {value}',
		sender: 'Absender: {value}',
		timestamp: 'Zeitpunkt: {value}'
	},
	experimental: {
		heading: 'Bestätigung',
		text: 'Hinweis: Das ist noch experimentelle Software. Diese reine Peer-to-Peer-Web-App (PWA) ist (noch) nicht für den Produktiveinsatz gedacht und nicht für Fälle, in denen echtes Geld oder echte Kontaktdaten auf dem Spiel stehen!\nBei Fragen wende dich an die Entwickler.'
	},
	onboarding: {
		shared: 'Kontaktdaten wurden mit dir geteilt',
		added: '{name} ist jetzt in deinem Adressbuch',
		yourDetails: 'Deine Kontaktdaten',
		email: 'E-Mail',
		emailPlaceholder: 'E-Mail eingeben …',
		firstName: 'Vorname',
		firstNamePlaceholder: 'Vorname eingeben …',
		lastName: 'Nachname',
		lastNamePlaceholder: 'Nachname eingeben …',
		street: 'Straße',
		streetPlaceholder: 'Straße eingeben …',
		zipCode: 'PLZ',
		zipCodePlaceholder: 'PLZ eingeben …',
		city: 'Ort',
		cityPlaceholder: 'Ort eingeben …',
		country: 'Land',
		countryPlaceholder: 'Land eingeben …',
		addAddress: 'Adresse hinzufügen',
		saveAndShare: 'Speichern und mit {name} teilen',
		saveOnly: 'Nur speichern',
		save: 'Speichern',
		problem: 'Deine Karte konnte nicht gespeichert werden. Bitte versuch es noch einmal.'
	},
	gate: {
		title: 'Dein deContact-Adressbuch',
		legacySeedRemoved:
			'deContact öffnet deine Identität jetzt mit einem Passkey. Die in diesem Browser gespeicherte Seed-Phrase wurde entfernt; ihre DID und ihr Adressbuch werden nicht übernommen.',
		unsupported: 'Dieser Browser kann keine Passkeys verwenden.',
		askNewTitle: 'Zu diesem Passkey haben wir kein Adressbuch gefunden',
		askNewText:
			'Wenn du dein deContact-Adressbuch mit diesem Passkey angelegt hast, mach weiter: Dieselbe Identität und dasselbe Adressbuch kommen aus dem Netzwerk zurück. Sonst brich ab und öffne einen Geräte-Link, importiere eine Tresordatei oder nutze deine Wiederherstellungswörter.',
		continueWithPasskey: 'Mit diesem Passkey weiter',
		onboardingHint:
			'Leg einen Passkey an, um dein eigenes Adressbuch zu öffnen. Dann kommen die Kontaktdaten an.',
		handedOver:
			'Ein Tresor von einem anderen Gerät liegt bereit: Öffne ihn mit einem seiner Passkeys oder mit den Wiederherstellungswörtern.',
		unlock: 'Mit Passkey entsperren',
		anotherPasskey: 'Anderen Passkey verwenden',
		passkeyName: 'Name des neuen Passkeys (optional)',
		passkeyNamePlaceholder: 'z. B. Laptop',
		create: 'Neues Adressbuch anlegen',
		signIn: 'Mit vorhandenem Passkey anmelden',
		restoreWords: 'Mit Wiederherstellungswörtern öffnen',
		wordsLabel: 'Deine 24 Wiederherstellungswörter',
		openWithWords: 'Öffnen',
		importFile: 'Oder importiere eine Tresordatei von einem anderen Gerät',
		opening: 'Tresor wird geöffnet …',
		noneCreated:
			'Es wurde kein Adressbuch angelegt. Öffne einen Geräte-Link, importiere eine Tresordatei oder nutze deine Wiederherstellungswörter.',
		noVault: 'Diese Datei enthält keinen deContact-Tresor.'
	},
	passkeys: {
		title: 'Passkeys und Wiederherstellungswörter',
		hint: 'Alle öffnen denselben Tresor und damit dieselbe Identität und dasselbe Adressbuch.',
		recoveryWords: 'Wiederherstellungswörter',
		openedNow: '{label} (in dieser Sitzung geöffnet)',
		added: 'hinzugefügt am {date}',
		reallyRemove: '{label} wirklich entfernen',
		keep: 'Behalten',
		remove: '{label} entfernen',
		name: 'Name des neuen Passkeys (optional)',
		namePlaceholder: 'z. B. Sicherheitsschlüssel',
		add: 'Passkey hinzufügen',
		writeDown:
			'Schreib diese 24 Wörter in dieser Reihenfolge auf und bewahre sie sicher auf. Sie werden nur jetzt angezeigt und nirgends gespeichert.',
		wroteDown: 'Ich habe die Wörter aufgeschrieben',
		keepWords: 'Diese Wiederherstellungswörter übernehmen',
		replaceWords: 'Wiederherstellungswörter ersetzen',
		setUpWords: 'Wiederherstellungswörter einrichten',
		linkDevice: 'Weiteres Gerät verbinden',
		download: 'Tresordatei herunterladen',
		linkHint:
			'Öffne diesen Link auf dem anderen Gerät und entsperre dort mit einem der Passkeys oder den Wiederherstellungswörtern. Die Tresordaten im Link enthalten kein Secret.',
		deviceLink: 'Geräte-Link',
		deviceLinkQr: 'QR-Code des Geräte-Links'
	},
	// der Passkey nach dem Austausch (#97): bis dahin eine vorläufige Identität
	secure: {
		title: {
			one: 'Diesen Kontakt behalten?',
			other: 'Diese Kontakte behalten?'
		},
		text: 'Sichere dein Adressbuch mit einem Passkey. Bis dahin gibt es dein Adressbuch nur in diesem Tab: Schließt du ihn, geht deine Seite des Austauschs verloren.',
		button: 'Mit Passkey sichern',
		notNow: 'Nicht jetzt',
		busy: 'Der Passkey wird angelegt …',
		settingsTitle: 'Noch nicht gesichert',
		settingsText: 'Dieses Adressbuch gibt es nur in diesem Tab. Sichere es mit einem Passkey, um es später wieder zu öffnen.',
		securedTitle: 'Mit deinem Passkey gesichert',
		safeguards:
			'Zwei weitere Wege zurück, wenn du magst: Wiederherstellungswörter, falls der Passkey verloren geht, und die Tresordatei, falls das Netzwerk deine Tresordaten nicht hat.',
		words: 'Wiederherstellungswörter aufschreiben',
		wordsKept: 'Die Wiederherstellungswörter öffnen dein Adressbuch jetzt auch.',
		downloaded: 'Die Tresordatei ist heruntergeladen.',
		skip: 'Überspringen',
		done: 'Fertig',
		signIn: 'Du hast schon einen deContact-Passkey? Anmelden'
	},
	passkeyProblem: {
		cancelledOrTimedOut: 'Die Passkey-Abfrage wurde abgebrochen oder ist abgelaufen.',
		cancelled: 'Abgebrochen.',
		noPrf:
			'Dieser Passkey kann kein Secret ableiten (keine PRF-Unterstützung). Nimm einen anderen Passkey, einen Passwortmanager oder einen Sicherheitsschlüssel mit PRF.',
		slotRemoved: 'Dieser Passkey wurde aus dem hier gespeicherten Adressbuch entfernt.',
		locked: 'Dieser Schlüssel öffnet das Adressbuch nicht.',
		slotExists: 'Dieser Passkey öffnet hier schon ein Adressbuch.',
		slotInUse:
			'Womit du den Tresor in dieser Sitzung geöffnet hast, lässt sich jetzt nicht entfernen oder ersetzen. Öffne ihn zuerst mit einem anderen Passkey.',
		storeUnreadable:
			'Der in diesem Browser gespeicherte Tresor lässt sich nicht lesen; er bleibt unverändert.'
	},
	passkeyStep: {
		create: {
			title: 'Jetzt deinen Passkey anlegen',
			why: 'Dein Gerät legt einen Passkey für diese App an, zum Beispiel mit Touch ID oder deiner PIN.'
		},
		prf: {
			title: 'Jetzt der Schlüssel für deine Daten',
			why: 'Dein Passkey gibt der App ein Secret, und daraus entsteht der Schlüssel für deine Daten.'
		}
	},
	settings: {
		did: 'DID',
		didHelp: 'Aus deinem Passkey-Tresor abgeleitet: für jeden deiner Passkeys dieselbe',
		peerId: 'PeerId (LibP2P)',
		peerIdHelp: 'Jedes Gerät hat eine eigene Peer-ID, unabhängig von deiner Identität',
		peers: 'Verbundene Peers',
		peersHelp: 'So viele Peers sind gerade mit unserem Peer-to-Peer-Netzwerk verbunden',
		webrtc: 'WebRTC (gilt nach dem Neuladen)',
		dropFollowers: 'Gefolgte und Follower-DBs löschen',
		dropAddressBook: 'Adress-DB löschen'
	},
	statistics: {
		connected: 'Seed-Node verbunden / Schwarm verbunden'
	},
	notify: {
		contactAdded: 'Im Adressbuch gespeichert.',
		cardUpdated: 'Deine Karte ist aktualisiert. Deine Kontakte bekommen die neue Fassung von selbst.',
		contactUpdated: 'Gespeichert.',
		contactRemoved: '{name} entfernt: Die Person bekommt keine Änderungen mehr von dir.',
		contactRemovedNameless: 'Entfernt: Die Person bekommt keine Änderungen mehr von dir.',
		contactDeleted: '{name} gelöscht.',
		contactDeletedNameless: 'Gelöscht.',
		invitationCopied: 'Einladungslink kopiert.',
		addressCopied: 'Kontaktadresse kopiert.',
		requestSent: 'Anfrage gesendet. Die Karte kommt, sobald die Person antwortet.',
		requestNotDelivered: 'Noch nicht erreicht. Die App versucht es weiter, solange sie offen ist.',
		noDevice: 'Diese Adresse nennt kein Gerät. Scanne den QR-Code der Person, die du fragen willst.',
		noContactAddress: 'Das ist keine Kontaktadresse. Scanne den QR-Code der Person, die du fragen willst.',
		cardWritten: 'Deine Karte ist unterwegs zu {name}.',
		cardWrittenNameless: 'Deine Karte ist unterwegs.',
		requestDeclined: 'Abgelehnt. Die Person bekommt deine Karte nicht.',
		openedWithWords: 'Mit deinen Wiederherstellungswörtern geöffnet. Leg in den Einstellungen einen Passkey für dieses Gerät an.',
		passkeyAdded: 'Passkey hinzugefügt. Er öffnet dasselbe Adressbuch.',
		slotRemoved: 'Entfernt: Das öffnet dein Adressbuch nicht mehr.',
		wordsKept: 'Deine Wiederherstellungswörter öffnen jetzt auch dein Adressbuch.',
		secured: 'Dein Adressbuch ist mit einem Passkey gesichert.',
		invitationLink: {
			malformed: 'Eine Anfrage kam mit einem fehlerhaften Einladungslink, darum entscheidest du selbst.',
			notOurs: 'Eine Anfrage kam mit einem Einladungslink, der nicht von dir ist, darum entscheidest du selbst.',
			expired: 'Eine Anfrage kam mit einem abgelaufenen Einladungslink, darum entscheidest du selbst.',
			notIssuedHere: 'Eine Anfrage kam mit einem Einladungslink von einem anderen Gerät, darum entscheidest du selbst.',
			alreadyUsed: 'Eine Anfrage kam mit einem schon benutzten Einladungslink, darum entscheidest du selbst.',
			other: 'Eine Anfrage kam mit einem Einladungslink, der sich nicht verwenden lässt, darum entscheidest du selbst.'
		}
	}
};
