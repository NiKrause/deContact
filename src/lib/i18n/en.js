// English (#89), the base language: de.js has the same keys, and a key it lacks shows in
// English. Placeholders like {name} are filled in by t().
export default {
	// what search engines and link previews read (seo.js), and the picture of the preview
	// (scripts/brand/og-image.html): the page of each language has its own
	meta: {
		title: 'deContact – self-updating · local · peer-to-peer',
		description:
			'The self-updating, local, peer-to-peer address book. Scan a QR code, exchange business cards, and your contacts keep themselves up to date, without a server that owns them.',
		previewDescription: 'Scan a QR code, exchange business cards. Your contacts keep themselves up to date, without a server that owns them.',
		imageAlt: 'deContact: two business cards being exchanged, and the words: self-updating, local, peer-to-peer.',
		imageLead: 'self-updating · local ·<br />peer-to-peer',
		noscript: 'The self-updating, local, peer-to-peer address book. deContact runs in your browser and needs JavaScript.',
		source: 'Source code and documentation on GitHub'
	},
	// what the app says about its build (AppInfo.svelte)
	about: {
		version: 'Version {version}',
		published: 'published {date}',
		commit: 'commit {commit}',
		source: 'Source on GitHub'
	},
	language: {
		label: 'Language',
		en: 'English',
		de: 'Deutsch'
	},
	common: {
		cancel: 'Cancel',
		continue: 'Continue',
		close: 'Close',
		ok: 'OK',
		on: 'On',
		off: 'Off',
		openMenu: 'Open menu',
		closeMenu: 'Close menu'
	},
	header: {
		theme: 'Switch the theme',
		peers: {
			none: 'No network or connecting...',
			seed: 'Seed Node connected',
			swarm: 'Swarm connected',
			count: { one: '({count} peer)', other: '({count} peers)' }
		}
	},
	// the four places (#110), at the bottom on a phone, a rail on a desktop
	nav: {
		label: 'Main',
		exchange: 'Exchange',
		contacts: 'Contacts',
		card: 'My business card',
		settings: 'Settings'
	},
	// the checklist of Show my code (#110, readiness.js)
	readiness: {
		title: 'Getting ready',
		book: 'Address book open',
		network: 'Network started',
		relay: 'Relay found and connected',
		reachable: 'Reachable for the other phone',
		link: 'Invitation link signed',
		card: 'Your business card has a name',
		fillCard: 'Fill in my business card',
		ready: 'Ready · reachable through the relay',
		gettingReady: 'Getting your code ready…',
		notReachable:
			'Not reachable yet. They can scan now, and the exchange completes as soon as you are both online (the link works for 24 hours).',
		state: {
			done: 'done',
			waiting: 'in progress',
			problem: 'needs attention'
		}
	},
	// circles (#100): which fields of our card a group of contacts sees
	circles: {
		title: 'Circles',
		hint: 'Each contact can be in a circle, and gets only the fields of your business card that their circle shows. Your name is always on it.',
		newCircle: 'Circle {n}',
		nameOf: 'Name of circle {n}',
		remove: 'Remove the circle {name}',
		add: 'Add circle',
		matrix: 'What each circle sees',
		field: 'Field',
		name: 'Name',
		photo: 'Photo',
		organization: 'Organization',
		shows: '{circle} sees {field}',
		defaultCircle: 'A new code is for',
		defaultCircleHelp: 'Who opens your code joins this circle. The code dialog lets you choose another.',
		save: 'Save circles',
		// the QR dialog
		codeFor: 'This code is for',
		codeForHelp: 'They get what this circle shows. Settings says what each circle sees.',
		defaults: {
			family: 'Family',
			friends: 'Friends',
			acquaintances: 'Acquaintances',
			business: 'Business'
		},
		// a contact's page
		circleOf: 'Circle',
		wholeCard: 'No circle: your whole business card',
		narrower: 'What {name} already received stays with them. From now on they get only what this circle shows.',
		narrowerNameless: 'What they already received stays with them. From now on they get only what this circle shows.'
	},
	// the start screen (#110)
	// My card (MyCard.svelte, #110): the card as others see it; before the first save, why
	card: {
		whyWhat: 'This is your business card: what people get when you exchange codes.',
		whyWho: 'Only the people you exchange with can read it. It is sealed to each of them.',
		whyUpdates: 'When something changes, they get the new version by themselves.',
		later: 'Later',
		asOthersSeeIt: 'This is how your contacts see your business card.',
		edit: 'Edit',
		// the entries of a card (#109, CardEntries.svelte): "Phone · Mobile"
		entryLabel: '{kind} · {label}',
		kinds: {
			phone: 'Phone',
			email: 'Email',
			address: 'Address',
			social: 'Profile'
		},
		labels: {
			mobile: 'Mobile',
			home: 'Home',
			work: 'Work',
			private: 'Private',
			other: 'Other'
		},
		networks: {
			mastodon: 'Mastodon',
			bluesky: 'Bluesky',
			linkedin: 'LinkedIn',
			github: 'GitHub',
			instagram: 'Instagram',
			x: 'X',
			website: 'Website',
			other: 'Other'
		},
		copyAddress: 'Copy address'
	},
	exchange: {
		ready: 'Ready to exchange',
		connecting: 'Connecting…',
		notReachable: 'Not reachable through a relay yet',
		fillCard: 'Fill in your business card: people get your name with it',
		// not "my card": the navigation's link has that name
		fillCardNow: 'Fill it in now',
		showCode: 'Show my code',
		scan: 'Scan a code',
		paste: 'Paste a contact address instead',
		pasteLabel: 'Contact address',
		ask: 'Ask'
	},
	home: {
		waiting: "Waiting for {name}'s phone…",
		waitingNameless: 'Waiting for the phone of the person who invited you…'
	},
	// the camera that reads a contact's QR code (QrScanner.svelte, <qr-scanner> of
	// @le-space/libp2p-webrtc-qr)
	scanner: {
		label: "Scan a contact's QR code",
		close: 'Close',
		unsupported: 'This browser cannot open a camera. Paste the contact address into the field instead.',
		insecure: 'A camera is only allowed on a secure page (https). Paste the contact address into the field instead.',
		denied: 'The camera was refused. Allow it in the address bar and press Scan again.',
		noDevice: 'No camera answered. If another app is using it, close that first.',
		starting: 'Starting the camera…',
		looking: 'Looking for a code… hold it steady and fill about half of the frame.',
		stillLooking: 'Still looking… {attempts} attempts. Move a little closer and avoid reflections.',
		notContact: 'That is no deContact contact or invitation.',
		animated: 'Animated code: {received} of {total} parts. Keep holding steady.',
		animatedUnknown: 'Animated code. Keep holding steady.',
		hint: 'Scan with the camera, or paste a contact address and press Scan'
	},
	toast: {
		success: 'Done',
		warning: 'Note',
		error: 'Error',
		close: 'Close notification'
	},
	contacts: {
		search: 'Search...',
		searchLabel: 'Search contacts',
		add: 'Add contact',
		back: 'All contacts',
		remove: 'Remove contact',
		empty: 'No contacts yet. Show your code or scan theirs on Exchange.',
		nameless: 'Somebody without a name on their business card',
		// a contact's page: the card in words, the technical parts collapsed (#110)
		// my notes on a contact (#109): ours alone
		notes: {
			label: 'My notes',
			hint: "Only you see them. They are not part of {name}'s business card.",
			hintNameless: 'Only you see them. They are not part of the business card.',
			save: 'Save note'
		},
		details: {
			technical: 'Technical details',
			did: 'DID',
			book: 'Address book'
		},
		clearSearch: 'Clear search input',
		invited: 'invited',
		canceled: 'request canceled',
		itemRange: {
			one: '{min}–{max} of {total} item',
			other: '{min}–{max} of {total} items'
		},
		pageRange: {
			one: 'of {total} page',
			other: 'of {total} pages'
		}
	},
	form: {
		photo: 'Photo',
		choosePhoto: 'Choose photo',
		removePhoto: 'Remove photo',
		photoProblem: 'This image could not be used.',
		firstName: 'First name',
		firstNamePlaceholder: 'Enter firstname...',
		lastName: 'Last name',
		lastNamePlaceholder: 'Enter lastname...',
		organization: 'Organization (optional)',
		// the entries of #109: each kind with its entries, "Add …" for more
		kinds: {
			phones: 'Phone',
			emails: 'Email',
			addresses: 'Address',
			social: 'Social media'
		},
		labelOf: {
			phone: 'Label of phone {n}',
			email: 'Label of email {n}',
			address: 'Label of address {n}'
		},
		networkOf: 'Network of profile {n}',
		entryOf: {
			phone: 'Phone {n}',
			email: 'Email {n}',
			profile: 'Profile {n}'
		},
		removeEntry: {
			phone: 'Remove phone {n}',
			email: 'Remove email {n}',
			address: 'Remove address {n}',
			profile: 'Remove profile {n}'
		},
		more: {
			phone: 'Add phone',
			email: 'Add email',
			address: 'Add address',
			profile: 'Add profile'
		},
		phonePlaceholder: 'Phone number',
		emailPlaceholder: 'name@example.com',
		// what a handle looks like, as the field's placeholder
		handles: {
			mastodon: '@name@server.example',
			bluesky: 'name.bsky.social',
			website: 'https://…',
			other: 'Your name there'
		},
		notALink: 'Shown as text: this is not a {network} profile name.',
		tooLong: 'At most {max} characters.',
		street: 'Street',
		streetPlaceholder: 'Enter street...',
		zipCode: 'Postal code',
		zipCodePlaceholder: 'Enter zipcode...',
		city: 'City',
		cityPlaceholder: 'Enter city...',
		country: 'Country',
		countryPlaceholder: 'Enter country...',
		update: 'Update',
		delete: 'Delete',
		save: 'Save',
		// asked before Delete (#110): a contact of somebody else is removed, one of ours deleted
		removeTitle: 'Remove {name}?',
		removeTitleNameless: 'Remove this contact?',
		removeText: 'They no longer get your updates, and your business card leaves their address book.',
		remove: 'Remove',
		deleteTitle: 'Delete {name}?',
		deleteTitleNameless: 'Delete this business card?',
		deleteText: 'The business card leaves your address book.'
	},
	qr: {
		heading: 'Share your contact',
		summaryBoth:
			'The first person to scan gets your contact details right away and can send you theirs. The code works for 24 hours.',
		summaryNow: 'The first person to scan gets your contact details right away. The code works for 24 hours.',
		summaryAsk:
			'Only deContact can scan this code: the person sends you a request, and you decide whether to share your contact details.',
		copyLink: 'Tap the code to copy the link',
		copyAddress: 'Tap the code to copy the contact address',
		mode: 'Your contact details',
		shareNow: 'Share right away',
		letThemAsk: 'Let them ask first',
		twoWay: 'Also ask for their contact details',
		twoWayHelp: 'They decide whether to send theirs.'
	},
	// the request dialog (AddressModal.svelte): somebody asks for our card
	request: {
		label: 'Contact request',
		wants: '{who} wants your contact details.',
		wantsBack: '{who} shared their business card with you and asks for yours.',
		what: 'If you share, they get your business card, and every later change of it by themselves.',
		whatBack: 'Their business card is in your address book. If you share yours, they get it, and every later change of it by themselves.',
		nameAndCity: '{name} ({city})',
		nameless: 'Somebody without a name on their business card',
		shareAndAsk: 'Share and ask for theirs',
		onlyShare: 'Only share mine',
		shareMine: 'Share mine',
		decline: 'Decline',
		details: 'Details',
		asked: 'Asked on {value}',
		sealed: 'The request is signed by their address book, and only you can read it.'
	},
	onboarding: {
		shared: 'Contact data have been shared with you',
		added: '{name} was added to your address book',
		yourDetails: 'Your contact details',
		email: 'Email',
		emailPlaceholder: 'Enter email...',
		firstName: 'First name',
		firstNamePlaceholder: 'Enter firstname...',
		lastName: 'Last name',
		lastNamePlaceholder: 'Enter lastname...',
		street: 'Street',
		streetPlaceholder: 'Enter street...',
		zipCode: 'Zip code',
		zipCodePlaceholder: 'Enter zipcode...',
		city: 'City',
		cityPlaceholder: 'Enter city...',
		country: 'Country',
		countryPlaceholder: 'Enter country...',
		addAddress: 'Add address',
		addPhone: 'Add phone',
		phone: 'Phone',
		phonePlaceholder: 'Phone number',
		saveAndShare: 'Save and share with {name}',
		saveAndShareNameless: 'Save and share',
		// until the inviter's card is here: their name is not known yet, and the DID is no name (#110)
		onTheWay: 'The business card of the person who invited you is on its way…',
		inviter: 'The person who invited you',
		saving: 'Saving your business card…',
		savingAndSharing: 'Saving your business card and sending it…',
		saveOnly: 'Save only',
		save: 'Save',
		problem: 'Your business card could not be saved. Please try again.'
	},
	gate: {
		title: 'Your deContact address book',
		// the start screen says what deContact is and why it asks for a passkey (#110)
		tagline: 'self-updating · local · peer-to-peer',
		lead: 'An address book that keeps itself up to date: you exchange business cards by QR code, straight from phone to phone, and your contacts get every change of yours by themselves.',
		why: 'A passkey opens it on this device: no account, no password, and no server that keeps your contacts.',
		otherWays: 'Other ways to open it',
		legacySeedRemoved:
			'deContact now opens your identity with a passkey. The seed phrase stored in this browser was removed; its DID and address book are not carried over.',
		unsupported: 'This browser cannot use passkeys.',
		askNewTitle: 'This passkey opens no address book we could find',
		askNewText:
			'If you created your deContact address book with this passkey, continue: the same identity and address book come back from the network. Otherwise cancel, and open a device link, import a vault file or use your recovery words.',
		continueWithPasskey: 'Continue with this passkey',
		onboardingHint: 'Create a passkey to open your own address book, then the contact data arrive.',
		handedOver:
			'A vault from another device is at hand: open it with one of its passkeys or with the recovery words.',
		unlock: 'Unlock with passkey',
		anotherPasskey: 'Use another passkey',
		passkeyName: 'Name of the new passkey (optional)',
		passkeyNamePlaceholder: 'e.g. Laptop',
		create: 'Create a new address book',
		signIn: 'Sign in with an existing passkey',
		restoreWords: 'Restore with recovery words',
		wordsLabel: 'Your 24 recovery words',
		openWithWords: 'Open with recovery words',
		chooseFile: 'Open a vault file from another device',
		experimental: 'deContact is experimental software: do not rely on it yet for contact details that matter.',
		opening: 'Opening the vault…',
		noneCreated:
			'No address book was created. Open a device link, import a vault file or use your recovery words.',
		noVault: 'This file holds no deContact vault.'
	},
	passkeys: {
		title: 'Passkeys and recovery words',
		hint: 'Each of them opens the same vault, and with it the same identity and address book.',
		recoveryWords: 'Recovery words',
		openedNow: '{label} (opened this session)',
		added: 'added {date}',
		reallyRemove: 'Really remove {label}',
		keep: 'Keep',
		remove: 'Remove {label}',
		name: 'Name of the new passkey (optional)',
		namePlaceholder: 'e.g. Security key',
		add: 'Add a passkey',
		writeDown:
			'Write these 24 words down, in this order, and keep them safe. They are shown only now and are not stored anywhere.',
		wroteDown: 'I have written the words down',
		keepWords: 'Keep these recovery words',
		replaceWords: 'Replace the recovery words',
		setUpWords: 'Set up recovery words',
		linkDevice: 'Link another device',
		download: 'Download vault file',
		linkHint:
			'Open this link on the other device, then unlock there with one of the passkeys or the recovery words. The vault record holds no secret.',
		deviceLink: 'Device link',
		deviceLinkQr: 'QR code of the device link'
	},
	// the passkey after the exchange (#97): a temporary identity until it is secured
	secure: {
		title: {
			one: 'Keep this contact?',
			other: 'Keep these contacts?'
		},
		text: 'Secure your address book with a passkey. Until then it lives in this tab only: closing it loses your side of the exchange.',
		button: 'Secure with a passkey',
		notNow: 'Not now',
		busy: 'Creating the passkey…',
		settingsTitle: 'Not secured yet',
		settingsText: 'This address book lives in this tab only. Secure it with a passkey to open it again later.',
		securedTitle: 'Secured with your passkey',
		safeguards:
			'Two more ways back in, if you like: recovery words, should the passkey be lost, and the vault file, should the network not have your vault record.',
		words: 'Write down recovery words',
		wordsKept: 'The recovery words open your address book too.',
		downloaded: 'The vault file is downloaded.',
		skip: 'Skip',
		done: 'Done',
		signIn: 'Already have a deContact passkey? Sign in'
	},
	passkeyProblem: {
		cancelledOrTimedOut: 'The passkey prompt was cancelled or timed out.',
		cancelled: 'Cancelled.',
		noPrf:
			'This passkey cannot derive a secret (no PRF support). Use another passkey, a password manager or a security key with PRF.',
		slotRemoved: 'This passkey was removed from the address book kept here.',
		locked: 'This key does not open the address book.',
		slotExists: 'This passkey already opens an address book here.',
		slotInUse:
			'What opened the vault in this session cannot be removed or replaced now. Open the vault with another passkey first.',
		storeUnreadable: 'The vault kept in this browser cannot be read; it was left as it is.'
	},
	// what <passkey-step-dialog> says before the passkey prompts deContact asks for
	passkeyStep: {
		create: {
			title: 'Now create your passkey',
			why: 'Your device creates a passkey for this app, with Touch ID or your PIN for example.'
		},
		prf: {
			title: 'Now the key for your data',
			why: 'Your passkey gives the app a secret, and the key for your data comes from it.'
		}
	},
	settings: {
		did: 'DID',
		didHelp: 'Derived from your passkey vault: the same for each of your passkeys',
		peerId: 'PeerId (LibP2P)',
		peerIdHelp: 'Every device has a unique peer id independent from your identity',
		peers: 'Connected Peers',
		peersHelp: 'This is the amount of peers which are connected in our peer-to-peer network',
		network: 'Network',
		webrtc: 'WebRTC (applies after reload)',
		dropFollowers: 'Drop Followed & Follower DBs',
		dropAddressBook: 'Drop AddressDB',
		// collapsed at the bottom: what only a developer needs (#110)
		developer: 'Developer',
		drop: 'Drop',
		dropFollowersTitle: 'Drop the copies of other address books?',
		dropFollowersText: "This device forgets its copies of your contacts' address books. Your own business card and your passkeys stay.",
		dropAddressBookTitle: 'Drop your address book on this device?',
		dropAddressBookText: 'This device forgets your address book: your business card and your contacts. What other devices and relays keep of it stays.'
	},
	statistics: {
		connected: 'Seed Node connected / Swarm connected'
	},
	// the toasts: sentences, without hashes, DIDs or command names (those go to the console, #110)
	notify: {
		contactAdded: 'Saved in your address book.',
		cardUpdated: 'Your business card is updated. Your contacts get the new version by themselves.',
		contactUpdated: 'Saved.',
		contactRemoved: 'Removed {name}: they no longer get your updates.',
		contactRemovedNameless: 'Removed: they no longer get your updates.',
		contactDeleted: 'Deleted {name}.',
		contactDeletedNameless: 'Deleted.',
		invitationCopied: 'Invitation link copied.',
		addressCopied: 'Contact address copied.',
		cardAddressCopied: 'Address copied.',
		cardTooLong: 'Not saved: a field is too long. It is marked in the form.',
		noteSaved: 'Note saved.',
		circleChanged: 'Saved. They get what this circle shows.',
		circlesSaved: 'Circles saved. Your contacts get what their circle shows.',
		requestSent: 'Request sent. Their business card arrives once they answer.',
		requestNotDelivered: 'Not reached yet. The app keeps trying while it is open.',
		noDevice: 'This address names no device. Scan the QR code of the person you want to ask.',
		noContactAddress: 'This is no contact address. Scan the QR code of the person you want to ask.',
		cardWritten: 'Your business card is on its way to {name}.',
		cardWrittenNameless: 'Your business card is on its way.',
		requestDeclined: 'Declined. They do not get your business card.',
		openedWithWords: 'Opened with your recovery words. Add a passkey for this device in Settings.',
		passkeyAdded: 'Passkey added. It opens the same address book.',
		slotRemoved: 'Removed: it no longer opens your address book.',
		wordsKept: 'Your recovery words now open your address book too.',
		secured: 'Your address book is secured with a passkey.',
		// a request came with an invitation link that is not good: the dialog asks instead
		invitationLink: {
			malformed: 'A request came with a damaged invitation link, so you decide yourself.',
			notOurs: 'A request came with an invitation link that is not yours, so you decide yourself.',
			expired: 'A request came with an expired invitation link, so you decide yourself.',
			notIssuedHere: 'A request came with an invitation link from another device, so you decide yourself.',
			alreadyUsed: 'A request came with an invitation link that was used already, so you decide yourself.',
			other: 'A request came with an invitation link that cannot be used, so you decide yourself.'
		}
	}
};
