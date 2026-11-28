// Light or dark, and the accent colour, before the first paint, as src/lib/theme.js decides
// them once the app runs. A file of its own, loaded by src/app.html before the page is
// painted: the Content-Security-Policy runs no inline script (src/lib/csp.js).
(function () {
	var choice = null;
	var accent = null;
	try {
		choice = localStorage.getItem('decontact.theme');
		accent = localStorage.getItem('decontact.accent');
	} catch (e) {
		// storage blocked: the system's setting, Carbon's blue
	}
	var dark =
		choice === 'dark' || (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
	document.documentElement.setAttribute('theme', dark ? 'g90' : 'white');
	document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
	document.documentElement.setAttribute(
		'data-accent',
		accent === 'teal' || accent === 'purple' ? accent : 'blue'
	);
	if (choice === 'light' || choice === 'dark') {
		document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
			meta.setAttribute('content', dark ? '#262626' : '#ffffff');
		});
	}
})();
