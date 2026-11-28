// Deutsch (#89): dieselben Schlüssel wie en.js. Kurzes UI-Deutsch mit „du“; Passkey, QR-Code
// und DID bleiben stehen (der Passkey, der Relay, der Token, das Secret).
export default {
	// was Suchmaschinen und Link-Vorschauen lesen (seo.js), und das Bild der Vorschau
	// (scripts/brand/og-image.html): die Seite jeder Sprache hat ihre eigenen
	meta: {
		title: 'deContact – Selbstaktualisierend · Lokal · Peer-to-Peer',
		description:
			'Das selbstaktualisierende, lokale Peer-to-Peer-Adressbuch. QR-Code scannen, Visitenkarten tauschen: Deine Kontakte bleiben von selbst aktuell, ohne einen Server, dem sie gehören.',
		previewDescription: 'QR-Code scannen, Visitenkarten tauschen. Deine Kontakte bleiben von selbst aktuell, ohne einen Server, dem sie gehören.',
		imageAlt: 'deContact: zwei Visitenkarten, die getauscht werden, und die Worte: Selbstaktualisierend, Lokal, Peer-to-Peer.',
		imageLead: 'Selbstaktualisierend ·<br />Lokal · Peer-to-Peer',
		noscript: 'Das selbstaktualisierende, lokale Peer-to-Peer-Adressbuch. deContact läuft in deinem Browser und braucht JavaScript.',
		source: 'Quellcode und Dokumentation auf GitHub'
	},
	// das Web-App-Manifest (lib/web-manifest.js): die Beschriftungen seiner Screenshots im Installationsdialog
	manifest: {
		screens: {
			exchange: 'Austausch: deinen Code zeigen oder den der anderen Person scannen',
			code: 'Dein Code und was die App dafür vorbereitet',
			contacts: 'Deine Kontakte, die sich selbst aktuell halten',
			card: 'Deine Visitenkarte, wie deine Kontakte sie sehen'
		}
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
	theme: {
		label: 'Farbschema',
		system: 'System',
		light: 'Hell',
		dark: 'Dunkel',
		help: 'System: hell oder dunkel, wie dieses Gerät eingestellt ist.'
	},
	accent: {
		label: 'Akzentfarbe',
		blue: 'Blau',
		teal: 'Petrol',
		purple: 'Violett',
		help: 'Die Farbe von Schaltflächen, Links und Markierungen.'
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
		peers: {
			none: 'Kein Netzwerk oder Verbindung wird aufgebaut …',
			seed: 'Seed-Node verbunden',
			swarm: 'Schwarm verbunden',
			count: { one: '({count} Peer)', other: '({count} Peers)' }
		}
	},
	nav: {
		label: 'Hauptnavigation',
		exchange: 'Austausch',
		contacts: 'Kontakte',
		card: 'Meine Visitenkarte',
		settings: 'Einstellungen'
	},
	readiness: {
		title: 'Vorbereitung',
		book: 'Adressbuch offen',
		network: 'Netzwerk gestartet',
		relay: 'Relay gefunden und verbunden',
		reachable: 'Für das andere Handy erreichbar',
		link: 'Einladungslink signiert',
		card: 'Deine Visitenkarte hat einen Namen',
		fillCard: 'Meine Visitenkarte ausfüllen',
		ready: 'Bereit · über das Relay erreichbar',
		gettingReady: 'Dein Code wird vorbereitet …',
		notReachable:
			'Noch nicht erreichbar. Die Person kann jetzt scannen; der Austausch klappt, sobald ihr beide online seid (der Link gilt 24 Stunden).',
		state: {
			done: 'erledigt',
			waiting: 'läuft',
			problem: 'braucht dich'
		}
	},
	circles: {
		title: 'Kreise',
		hint: 'Jeder Kontakt kann in einem Kreis sein und bekommt nur die Felder deiner Visitenkarte, die sein Kreis zeigt. Dein Name steht immer darauf.',
		newCircle: 'Kreis {n}',
		nameOf: 'Name von Kreis {n}',
		remove: 'Kreis {name} entfernen',
		add: 'Kreis hinzufügen',
		matrix: 'Was jeder Kreis sieht',
		field: 'Feld',
		name: 'Name',
		photo: 'Foto',
		organization: 'Organisation',
		shows: '{circle} sieht {field}',
		defaultCircle: 'Ein neuer Code ist für',
		defaultCircleHelp: 'Wer deinen Code öffnet, kommt in diesen Kreis. Im Code-Dialog kannst du einen anderen wählen.',
		save: 'Kreise speichern',
		codeFor: 'Dieser Code ist für',
		codeForHelp: 'Die Person bekommt, was dieser Kreis zeigt. Was jeder Kreis sieht, steht in den Einstellungen.',
		defaults: {
			family: 'Familie',
			friends: 'Freunde',
			acquaintances: 'Bekannte',
			business: 'Geschäftlich'
		},
		circleOf: 'Kreis',
		wholeCard: 'Kein Kreis: deine ganze Visitenkarte',
		narrower: 'Was {name} schon bekommen hat, bleibt dort. Ab jetzt kommt nur noch an, was dieser Kreis zeigt.',
		narrowerNameless: 'Was schon angekommen ist, bleibt dort. Ab jetzt kommt nur noch an, was dieser Kreis zeigt.'
	},
	card: {
		whyWhat: 'Das ist deine Visitenkarte: Sie bekommen Menschen, wenn ihr Codes tauscht.',
		whyWho: 'Lesen können sie nur die Menschen, mit denen du tauschst. Sie ist für jeden von ihnen versiegelt.',
		whyUpdates: 'Ändert sich etwas, bekommen sie die neue Fassung von selbst.',
		later: 'Später',
		asOthersSeeIt: 'So sehen deine Kontakte deine Visitenkarte.',
		edit: 'Bearbeiten',
		entryLabel: '{kind} · {label}',
		kinds: {
			phone: 'Telefon',
			email: 'E-Mail',
			address: 'Adresse',
			social: 'Profil'
		},
		labels: {
			mobile: 'Mobil',
			home: 'Zuhause',
			work: 'Arbeit',
			private: 'Privat',
			other: 'Sonstige'
		},
		networks: {
			mastodon: 'Mastodon',
			bluesky: 'Bluesky',
			linkedin: 'LinkedIn',
			github: 'GitHub',
			instagram: 'Instagram',
			x: 'X',
			website: 'Website',
			other: 'Sonstiges'
		},
		copyAddress: 'Adresse kopieren'
	},
	exchange: {
		ready: 'Bereit zum Austausch',
		connecting: 'Verbinde …',
		notReachable: 'Noch nicht über ein Relay erreichbar',
		fillCard: 'Füll deine Visitenkarte aus: Damit bekommen andere deinen Namen',
		fillCardNow: 'Jetzt ausfüllen',
		showCode: 'Meinen Code zeigen',
		scan: 'Code scannen',
		paste: 'Stattdessen eine Kontaktadresse einfügen',
		pasteLabel: 'Kontaktadresse',
		ask: 'Anfragen'
	},
	home: {
		waiting: 'Warte auf das Handy von {name} …',
		waitingNameless: 'Warte auf das Handy der Person, die dich eingeladen hat …'
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
		search: 'Suchen …',
		searchLabel: 'Kontakte durchsuchen',
		add: 'Kontakt hinzufügen',
		back: 'Alle Kontakte',
		choose: 'Wähle links einen Kontakt, um die Visitenkarte zu sehen.',
		remove: 'Kontakt entfernen',
		empty: 'Noch keine Kontakte. Zeig unter Austausch deinen Code oder scanne ihren.',
		nameless: 'Jemand ohne Namen auf der Visitenkarte',
		notes: {
			label: 'Meine Notizen',
			hint: 'Nur du siehst sie. Sie gehören nicht zur Visitenkarte von {name}.',
			hintNameless: 'Nur du siehst sie. Sie gehören nicht zur Visitenkarte.',
			save: 'Notiz speichern'
		},
		details: {
			technical: 'Technische Details',
			did: 'DID',
			book: 'Adressbuch'
		},
		clearSearch: 'Suche leeren',
		invited: 'eingeladen',
		canceled: 'Anfrage abgelehnt',
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
		organization: 'Organisation (optional)',
		kinds: {
			phones: 'Telefon',
			emails: 'E-Mail',
			addresses: 'Adresse',
			social: 'Soziale Medien'
		},
		labelOf: {
			phone: 'Bezeichnung von Telefon {n}',
			email: 'Bezeichnung von E-Mail {n}',
			address: 'Bezeichnung von Adresse {n}'
		},
		networkOf: 'Netzwerk von Profil {n}',
		entryOf: {
			phone: 'Telefon {n}',
			email: 'E-Mail {n}',
			profile: 'Profil {n}'
		},
		removeEntry: {
			phone: 'Telefon {n} entfernen',
			email: 'E-Mail {n} entfernen',
			address: 'Adresse {n} entfernen',
			profile: 'Profil {n} entfernen'
		},
		more: {
			phone: 'Telefon hinzufügen',
			email: 'E-Mail hinzufügen',
			address: 'Adresse hinzufügen',
			profile: 'Profil hinzufügen'
		},
		phonePlaceholder: 'Telefonnummer',
		emailPlaceholder: 'name@example.com',
		handles: {
			mastodon: '@name@server.example',
			bluesky: 'name.bsky.social',
			website: 'https://…',
			other: 'Dein Name dort'
		},
		notALink: 'Erscheint als Text: Das ist kein Profilname bei {network}.',
		tooLong: 'Höchstens {max} Zeichen.',
		street: 'Straße',
		streetPlaceholder: 'Straße eingeben …',
		zipCode: 'PLZ',
		zipCodePlaceholder: 'PLZ eingeben …',
		city: 'Ort',
		cityPlaceholder: 'Ort eingeben …',
		country: 'Land',
		countryPlaceholder: 'Land eingeben …',
		update: 'Aktualisieren',
		delete: 'Löschen',
		save: 'Speichern',
		removeTitle: '{name} entfernen?',
		removeTitleNameless: 'Diesen Kontakt entfernen?',
		removeText: 'Die Person bekommt keine Änderungen mehr von dir, und deine Visitenkarte verschwindet aus ihrem Adressbuch.',
		remove: 'Entfernen',
		deleteTitle: '{name} löschen?',
		deleteTitleNameless: 'Diese Visitenkarte löschen?',
		deleteText: 'Die Visitenkarte verschwindet aus deinem Adressbuch.'
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
		label: 'Kontaktanfrage',
		wants: '{who} möchte deine Kontaktdaten.',
		wantsBack: '{who} hat dir die eigene Visitenkarte geschickt und möchte deine.',
		what: 'Wenn du teilst, bekommt die Person deine Visitenkarte und später jede Änderung daran von selbst.',
		whatBack: 'Ihre Visitenkarte ist in deinem Adressbuch. Wenn du deine teilst, bekommt die Person sie und später jede Änderung daran von selbst.',
		nameAndCity: '{name} ({city})',
		nameless: 'Jemand ohne Namen auf der Visitenkarte',
		shareAndAsk: 'Teilen und um ihre bitten',
		onlyShare: 'Nur meine teilen',
		shareMine: 'Meine teilen',
		decline: 'Ablehnen',
		details: 'Details',
		asked: 'Angefragt am {value}',
		sealed: 'Die Anfrage ist von ihrem Adressbuch signiert, und nur du kannst sie lesen.'
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
		addPhone: 'Telefon hinzufügen',
		phone: 'Telefon',
		phonePlaceholder: 'Telefonnummer',
		saveAndShare: 'Speichern und mit {name} teilen',
		saveAndShareNameless: 'Speichern und teilen',
		onTheWay: 'Die Visitenkarte der Person, die dich eingeladen hat, ist unterwegs …',
		inviter: 'Die Person, die dich eingeladen hat',
		saving: 'Deine Visitenkarte wird gespeichert …',
		savingAndSharing: 'Deine Visitenkarte wird gespeichert und verschickt …',
		saveOnly: 'Nur speichern',
		save: 'Speichern',
		problem: 'Deine Visitenkarte konnte nicht gespeichert werden. Bitte versuch es noch einmal.'
	},
	gate: {
		title: 'Dein deContact-Adressbuch',
		tagline: 'Selbstaktualisierend · Lokal · Peer-to-Peer',
		lead: 'Ein Adressbuch, das sich selbst aktuell hält: Du tauschst Visitenkarten per QR-Code direkt von Handy zu Handy, und deine Kontakte bekommen jede Änderung von dir von selbst.',
		useful: 'So erreichen sie dich auch nach einem Umzug oder Jobwechsel.',
		why: 'Ein Passkey öffnet dein Adressbuch auf diesem Gerät: kein Konto, kein Passwort und kein Server, der deine Kontakte aufbewahrt.',
		usefulTitle: 'Wozu ist das gut?',
		usefulText:
			'Mit Menschen, die du auf einer Konferenz, in der Ausbildung, im Studium oder im Beruf kennenlernst, reißt der Kontakt leicht ab: Du ziehst danach um, wechselst die Stelle, die Telefonnummer oder die E-Mail-Adresse, oder du verlässt ein soziales Netzwerk. Mit deContact bekommen sie deine neuen Daten von selbst, und du bekommst ihre.',
		otherWays: 'Andere Wege, es zu öffnen',
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
		chooseFile: 'Tresordatei von einem anderen Gerät öffnen',
		experimental: 'deContact ist experimentelle Software: Verlass dich bei wichtigen Kontaktdaten noch nicht darauf.',
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
		network: 'Netzwerk',
		webrtc: 'WebRTC (gilt nach dem Neuladen)',
		dropFollowers: 'Gefolgte und Follower-DBs löschen',
		dropAddressBook: 'Adress-DB löschen',
		developer: 'Entwicklung',
		drop: 'Löschen',
		dropFollowersTitle: 'Die Kopien fremder Adressbücher löschen?',
		dropFollowersText: 'Dieses Gerät vergisst seine Kopien der Adressbücher deiner Kontakte. Deine eigene Visitenkarte und deine Passkeys bleiben.',
		dropAddressBookTitle: 'Dein Adressbuch auf diesem Gerät löschen?',
		dropAddressBookText: 'Dieses Gerät vergisst dein Adressbuch: deine Visitenkarte und deine Kontakte. Was andere Geräte und Relays davon haben, bleibt.'
	},
	statistics: {
		connected: 'Seed-Node verbunden / Schwarm verbunden'
	},
	notify: {
		contactAdded: 'Im Adressbuch gespeichert.',
		cardUpdated: 'Deine Visitenkarte ist aktualisiert. Deine Kontakte bekommen die neue Fassung von selbst.',
		contactUpdated: 'Gespeichert.',
		contactRemoved: '{name} entfernt: Die Person bekommt keine Änderungen mehr von dir.',
		contactRemovedNameless: 'Entfernt: Die Person bekommt keine Änderungen mehr von dir.',
		contactDeleted: '{name} gelöscht.',
		contactDeletedNameless: 'Gelöscht.',
		invitationCopied: 'Einladungslink kopiert.',
		addressCopied: 'Kontaktadresse kopiert.',
		cardAddressCopied: 'Adresse kopiert.',
		cardTooLong: 'Nicht gespeichert: Ein Feld ist zu lang. Es ist im Formular markiert.',
		noteSaved: 'Notiz gespeichert.',
		circleChanged: 'Gespeichert. Ab jetzt kommt an, was dieser Kreis zeigt.',
		circlesSaved: 'Kreise gespeichert. Deine Kontakte bekommen, was ihr Kreis zeigt.',
		requestSent: 'Anfrage gesendet. Die Visitenkarte kommt, sobald die Person antwortet.',
		requestNotDelivered: 'Noch nicht erreicht. Die App versucht es weiter, solange sie offen ist.',
		noDevice: 'Diese Adresse nennt kein Gerät. Scanne den QR-Code der Person, die du fragen willst.',
		noContactAddress: 'Das ist keine Kontaktadresse. Scanne den QR-Code der Person, die du fragen willst.',
		cardWritten: 'Deine Visitenkarte ist unterwegs zu {name}.',
		cardWrittenNameless: 'Deine Visitenkarte ist unterwegs.',
		requestDeclined: 'Abgelehnt. Die Person bekommt deine Visitenkarte nicht.',
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
	},
	// eine Visitenkarte als vCard für das Adressbuch des Handys (VCardButton.svelte, lib/card/vcard.js, #146)
	vcard: {
		save: 'In meine Kontakte übernehmen (vCard)',
		export: 'Als vCard exportieren',
		help: 'Eine Kopie für das Adressbuch deines Handys. Sie aktualisiert sich nicht selbst, deContact schon.',
		note: 'Aus deContact übernommen. Dort immer aktuell: {link}',
		noteNoLink: 'Aus deContact übernommen. Dort ist sie immer aktuell.'
	},
	// die App installieren (InstallApp.svelte, lib/pwa/install.js, #146)
	install: {
		button: 'deContact installieren',
		why: 'Dann erreichen dich die Änderungen deiner Kontakte, auch wenn dieser Tab geschlossen ist.',
		ios: 'Tippe in Safari auf „Teilen“ (das Quadrat mit dem Pfeil) und dann auf „Zum Home-Bildschirm“.'
	}
};
