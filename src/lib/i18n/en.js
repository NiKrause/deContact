// English (#89), the base language: de.js has the same keys, and a key it lacks shows in
// English. Placeholders like {name} are filled in by t().
export default {
	app: {
		tagline: '– self-updating · local · peer-to-peer'
	},
	// what search engines and link previews read (seo.js), and the picture of the preview
	// (scripts/brand/og-image.html): the page of each language has its own
	meta: {
		title: 'deContact – self-updating · local · peer-to-peer',
		description:
			'The self-updating, local, peer-to-peer address book. Scan a QR code, exchange cards, and your contacts keep themselves up to date, without a server that owns them.',
		previewDescription: 'Scan a QR code, exchange cards. Your contacts keep themselves up to date, without a server that owns them.',
		imageAlt: 'deContact: two contact cards being exchanged, and the words: self-updating, local, peer-to-peer.',
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
	tabs: {
		contacts: 'Contacts',
		myAddress: 'My Address',
		statistics: 'Statistics',
		settings: 'Settings'
	},
	home: {
		scan: 'Scan',
		scanLabel: 'Contact address',
		qrCode: 'QR Code',
		waiting: "Waiting for {name}'s phone…"
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
		name: 'Name',
		firstName: 'Firstname',
		search: 'Search...',
		searchLabel: 'Search contacts',
		clearSearch: 'Clear search input',
		// what Carbon's table says to a screen reader (its translateWithId)
		table: {
			selectRow: 'Open this contact in My Address',
			selectAll: 'Select all contacts',
			expandRow: 'Expand current row',
			collapseRow: 'Collapse current row',
			expandAll: 'Expand all rows',
			collapseAll: 'Collapse all rows',
			expandColumn: 'Expand rows'
		},
		invited: 'invited',
		canceled: 'request canceled',
		nextPage: 'Next page',
		previousPage: 'Previous page',
		page: 'page {page}',
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
		firstName: 'firstname',
		firstNamePlaceholder: 'Enter firstname...',
		lastName: 'lastname',
		lastNamePlaceholder: 'Enter lastname...',
		street: 'street',
		streetPlaceholder: 'Enter street...',
		zipCode: 'zipcode',
		zipCodePlaceholder: 'Enter zipcode...',
		city: 'city',
		cityPlaceholder: 'Enter city...',
		country: 'country',
		countryPlaceholder: 'Enter country...',
		email: 'Email',
		emailPlaceholder: 'Email',
		category: 'Category',
		categories: {
			private: 'Private',
			business: 'Business',
			other: 'Other'
		},
		own: 'our own address',
		update: 'Update',
		new: 'New',
		delete: 'Delete',
		add: 'Add'
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
	request: {
		label: 'deContact Protocol Action',
		heading: 'deContact address request',
		send: 'Send My Contact Data',
		from: 'From:',
		nameless: 'somebody without a name on their card',
		owner: 'owner:',
		askBack: 'Request contact data from {name}',
		them: 'them',
		details: 'View Transaction Details',
		showDetails: 'Show the details',
		hideDetails: 'Hide the details',
		command: 'Command: {value}',
		recipient: 'Recipient: {value}',
		sender: 'Sender: {value}',
		timestamp: 'TimeStamp: {value}'
	},
	experimental: {
		heading: 'Confirmation',
		text: 'Note: This is still experimental software. This peer-to-peer only progressive web app (PWA) is not (yet) intended for use in production environments or for use where real money or real contact data are at stake!\nPlease contact developers for questions.'
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
		saveAndShare: 'Save and share with {name}',
		saveOnly: 'Save only',
		save: 'Save',
		problem: 'Your card could not be saved. Please try again.'
	},
	gate: {
		title: 'Your deContact address book',
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
		importFile: 'Or import a vault file from another device',
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
		webrtc: 'WebRTC (applies after reload)',
		dropFollowers: 'Drop Followed & Follower DBs',
		dropAddressBook: 'Drop AddressDB'
	},
	statistics: {
		connected: 'Seed Node connected / Swarm connected'
	},
	// the toasts: sentences, without hashes, DIDs or command names (those go to the console, #110)
	notify: {
		contactAdded: 'Saved in your address book.',
		cardUpdated: 'Your card is updated. Your contacts get the new version by themselves.',
		contactUpdated: 'Saved.',
		contactRemoved: 'Removed {name}: they no longer get your updates.',
		contactRemovedNameless: 'Removed: they no longer get your updates.',
		contactDeleted: 'Deleted {name}.',
		contactDeletedNameless: 'Deleted.',
		invitationCopied: 'Invitation link copied.',
		addressCopied: 'Contact address copied.',
		requestSent: 'Request sent. Their card arrives once they answer.',
		requestNotDelivered: 'Not reached yet. The app keeps trying while it is open.',
		noDevice: 'This address names no device. Scan the QR code of the person you want to ask.',
		noContactAddress: 'This is no contact address. Scan the QR code of the person you want to ask.',
		cardWritten: 'Your card is on its way to {name}.',
		cardWrittenNameless: 'Your card is on its way.',
		requestDeclined: 'Declined. They do not get your card.',
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
