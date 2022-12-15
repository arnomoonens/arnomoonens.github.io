<script lang="ts">
  import About from './About.svelte';
  import Work from './Work.svelte';

  import profileImage from './images/arno.jpeg';
  import backgroundImage from './images/bg.jpeg';
  import overlayImage from './images/overlay.png';

  let bodyPreload = true;
  let bodyIsSwitching = false;
  let bodyIsArticleVisible = false;

  const components = {about: About, work: Work}
  let selectedComponent = null;
  let headerVisible = true;
  let footerVisible = true;
  const delay = 325;
  let locked = false;

  function hashHasValue(v: string): boolean {
	return v !== '' && v !== '#';
  }

  function handleHashChange() {
	  if (hashHasValue(location.hash)) {
		let componentName = location.hash.slice(1);
		showArticle(componentName, true);
	  }
  }

  function handleWindowKeyup(event: KeyboardEvent) {
	if (event.key == 'Escape' && bodyIsArticleVisible) {
		hideArticle(true);
	}
  }

  function handleWindowLoad(x) {
	window.setTimeout(function() {
					bodyPreload = false;
				}, 100);
	handleHashChange();
  }

  function handlePageClose() {
	hideArticle(true);
  }

function showArticle(x: string, initial: boolean) {
	let component = components[x];
	if (locked || (typeof initial != 'undefined' && initial === true)) {
		bodyIsSwitching = true;
		bodyIsArticleVisible = true;
		selectedComponent = null;

		headerVisible = false;
		footerVisible = false;

		selectedComponent = component;

		locked = false;

		setTimeout(function() {
			bodyIsSwitching = false;
		}, (initial ? 1000 : 0));
		return;
	}

	locked = true;

	// Article already visible? Just swap articles.
	if (bodyIsArticleVisible) {
		selectedComponent = component;
		// Unlock.
		setTimeout(function() {
			locked = false;
		}, delay);
	} else { // handle as normal
		bodyIsArticleVisible = true;
		headerVisible = false;
		footerVisible = false;
		selectedComponent = component;
		// Unlock.
		setTimeout(function() {
			locked = false;
		}, delay);
	}
}

  function hideArticle(addState: boolean) {
	if (!bodyIsArticleVisible) {
		return;
	}
	// Add state?
	if (typeof addState != 'undefined' &&	addState === true) {
		history.pushState(null, null, '#');
	}

	if (locked) {
		bodyIsSwitching = true;
		selectedComponent = null;
		footerVisible = true;
		headerVisible = true;
		bodyIsArticleVisible = false;
		locked = false;
		bodyIsSwitching = false;
		return;
	}
	locked = true;
	selectedComponent = null;
	setTimeout(() => {
		footerVisible = true;
		headerVisible = true;
		setTimeout(() => {
			bodyIsArticleVisible = false;
			setTimeout(function() {
				locked = false;
			}, delay);
		}, 25);
	}, delay);
  }

  function handleBodyClick() {
	if (bodyIsArticleVisible) {
		hideArticle(true);
	}
  }

  const navItems = [
	{name: "About", uri: "about", enabled: true},
	{name: "Work", uri: "work", enabled: true},
	{name: "Contact", uri: "contact", enabled: true},
	{name: "Elements", uri: "elements", enabled: true},
  ]

  $: enabledNavItems = navItems.filter(x => x.enabled);
  $: evenNavItems = enabledNavItems.length % 2 == 0;


</script>

<svelte:window on:load={handleWindowLoad} on:hashchange={handleHashChange} on:keyup={handleWindowKeyup}/>

<div id="body" class:is-preload={bodyPreload} class:is-article-visible={bodyIsArticleVisible} class:is-switching={bodyIsSwitching} on:click={handleBodyClick}>
		<div id="wrapper">

		<!-- Header -->
		{#if headerVisible}
			<header id="header">
				<div class="logo">
					<!--<span class="icon fa-gem"></span>-->
					<span class="image fit"><img src={profileImage} alt="Arno Moonens"></span>
				</div>
				<div class="content">
					<div class="inner">
						<h1>Arno Moonens</h1>
						<p>Data Science/ML engineer at <a href="https://unipartners.be">UniPartners</a>.</p>
					</div>
				</div>
				<nav class:use-middle={evenNavItems}>
					<ul>
						{#each enabledNavItems as navItem, i}
							<li class:is-middle={evenNavItems && i == enabledNavItems.length / 2}><a href="#{navItem.uri}">{navItem.name}</a></li>
						{/each}
					</ul>
				</nav>
			</header>
		{/if}
		{#if selectedComponent}
			<div id="main">
				<svelte:component  on:close={handlePageClose} this={selectedComponent}/>
			</div>
		{/if}

			<!-- Footer -->
		{#if footerVisible}
			<footer id="footer">
				<p class="copyright">&copy; Arno Moonens. Design: <a href="https://html5up.net">HTML5 UP</a>. Images: <a href="https://unsplash.com">Unsplash</a>.</p>
			</footer>
		{/if}
      </div>

	<div id="bg" style:--background-image="url({backgroundImage})" style:--overlay-image="url({overlayImage})"></div>
</div>

<style>

@import url("https://fonts.googleapis.com/css?family=Source+Sans+Pro:300italic,600italic,300,600");

#header .logo {
  width: 5.5rem;
  height: 5.5rem;
  line-height: 5.5rem;
  border-radius: 100%;
  border: solid 1px #ffffff;
  overflow: hidden;
}

			#header .logo .icon:before {
				font-size: 2rem;
			}

.logo img {
  width: 100%;
  height: 100%
}


/* Image */

	.image {
		border-radius: 4px;
		border: 0;
		display: inline-block;
		position: relative;
	}

		.image:before {
			pointer-events: none;
			background-image: url("../../images/overlay.png");
			background-color: rgba(19, 21, 25, 0.5);
			border-radius: 4px;
			content: '';
			display: block;
			height: 100%;
			left: 0;
			opacity: 0.5;
			position: absolute;
			top: 0;
			width: 100%;
		}

		.image img {
			border-radius: 4px;
			display: block;
		}

		.image.left, .image.right {
			max-width: 40%;
		}

			.image.left img, .image.right img {
				width: 100%;
			}

		.image.left {
			float: left;
			padding: 0 1.5em 1em 0;
			top: 0.25em;
		}

		.image.right {
			float: right;
			padding: 0 0 1em 1.5em;
			top: 0.25em;
		}

		.image.fit {
			display: block;
			margin: 0 0 2rem 0;
			height: 100%;
		}

			.image.fit img {
				height: 100%;
			}

		.image.main {
			display: block;
			margin: 2.5rem 0;
			width: 100%;
		}

			.image.main img {
				width: 100%;
			}

		@media screen and (max-width: 736px) {

			.image.main {
				margin: 2rem 0;
			}

		}

		@media screen and (max-width: 480px) {

			.image.main {
				margin: 1.5rem 0;
			}

		}

/* Wrapper */

	#wrapper {
		display: -moz-flex;
		display: -webkit-flex;
		display: -ms-flex;
		display: flex;
		-moz-flex-direction: column;
		-webkit-flex-direction: column;
		-ms-flex-direction: column;
		flex-direction: column;
		-moz-align-items: center;
		-webkit-align-items: center;
		-ms-align-items: center;
		align-items: center;
		-moz-justify-content: space-between;
		-webkit-justify-content: space-between;
		-ms-justify-content: space-between;
		justify-content: space-between;
		position: relative;
		min-height: 100vh;
		width: 100%;
		padding: 4rem 2rem;
		z-index: 3;
	}

		#wrapper:before {
			content: '';
			display: block;
		}

		@media screen and (max-width: 1680px) {

			#wrapper {
				padding: 3rem 2rem;
			}

		}

		@media screen and (max-width: 736px) {

			#wrapper {
				padding: 2rem 1rem;
			}

		}

		@media screen and (max-width: 480px) {

			#wrapper {
				padding: 1rem;
			}

		}


/* Header */

	#header {
		display: -moz-flex;
		display: -webkit-flex;
		display: -ms-flex;
		display: flex;
		-moz-flex-direction: column;
		-webkit-flex-direction: column;
		-ms-flex-direction: column;
		flex-direction: column;
		-moz-align-items: center;
		-webkit-align-items: center;
		-ms-align-items: center;
		align-items: center;
		-moz-transition: -moz-transform 0.325s ease-in-out, -moz-filter 0.325s ease-in-out, opacity 0.325s ease-in-out;
		-webkit-transition: -webkit-transform 0.325s ease-in-out, -webkit-filter 0.325s ease-in-out, opacity 0.325s ease-in-out;
		-ms-transition: -ms-transform 0.325s ease-in-out, -ms-filter 0.325s ease-in-out, opacity 0.325s ease-in-out;
		transition: transform 0.325s ease-in-out, filter 0.325s ease-in-out, opacity 0.325s ease-in-out;
		background-image: -moz-radial-gradient(rgba(0, 0, 0, 0.25) 25%, rgba(0, 0, 0, 0) 55%);
		background-image: -webkit-radial-gradient(rgba(0, 0, 0, 0.25) 25%, rgba(0, 0, 0, 0) 55%);
		background-image: -ms-radial-gradient(rgba(0, 0, 0, 0.25) 25%, rgba(0, 0, 0, 0) 55%);
		background-image: radial-gradient(rgba(0, 0, 0, 0.25) 25%, rgba(0, 0, 0, 0) 55%);
		max-width: 100%;
		text-align: center;
	}

		#header > * {
			-moz-transition: opacity 0.325s ease-in-out;
			-webkit-transition: opacity 0.325s ease-in-out;
			-ms-transition: opacity 0.325s ease-in-out;
			transition: opacity 0.325s ease-in-out;
			position: relative;
			margin-top: 3.5rem;
		}

#header > *:before {
  content: '';
  display: block;
  position: absolute;
  top: calc(-3.5rem - 1px);
  left: calc(50% - 1px);
  width: 1px;
  height: calc(3.5rem + 1px);
  background: #ffffff;
}

#header .content {
  border-style: solid;
  border-color: #ffffff;
  border-top-width: 1px;
  border-bottom-width: 1px;
  max-width: 100%;
}

			#header .content .inner {
				-moz-transition: max-height 0.75s ease, padding 0.75s ease, opacity 0.325s ease-in-out;
				-webkit-transition: max-height 0.75s ease, padding 0.75s ease, opacity 0.325s ease-in-out;
				-ms-transition: max-height 0.75s ease, padding 0.75s ease, opacity 0.325s ease-in-out;
				transition: max-height 0.75s ease, padding 0.75s ease, opacity 0.325s ease-in-out;
				-moz-transition-delay: 0.25s;
				-webkit-transition-delay: 0.25s;
				-ms-transition-delay: 0.25s;
				transition-delay: 0.25s;
				padding: 3rem 2rem;
				max-height: 40rem;
				overflow: hidden;
			}

      				#header .content .inner > :last-child {
					margin-bottom: 0;
				}

			#header .content p {
				text-transform: uppercase;
				letter-spacing: 0.2rem;
				font-size: 0.8rem;
				line-height: 2;
			}

		#header nav ul {
			display: -moz-flex;
			display: -webkit-flex;
			display: -ms-flex;
			display: flex;
			margin-bottom: 0;
			list-style: none;
			padding-left: 0;
			border: solid 1px #ffffff;
			border-radius: 4px;
		}

#header nav ul li {
  padding-left: 0;
  border-left: solid 1px #ffffff;
}

  #header nav ul li:first-child {
    border-left: 0;
  }

#header nav ul li a {
  display: block;
  min-width: 7.5rem;
  height: 2.75rem;
  line-height: 2.75rem;
  padding: 0 1.25rem 0 1.45rem;
  text-transform: uppercase;
  letter-spacing: 0.2rem;
  font-size: 0.8rem;
  border-bottom: 0;
}

					#header nav ul li a:hover {
						background-color: rgba(255, 255, 255, 0.075);
					}

					#header nav ul li a:active {
						background-color: rgba(255, 255, 255, 0.175);
					}

		#header nav.use-middle:after {
			content: '';
			display: block;
			position: absolute;
			top: 0;
			left: calc(50% - 1px);
			width: 1px;
			height: 100%;
			background: #ffffff;
		}

		#header nav.use-middle ul li.is-middle {
			border-left: 0;
		}

		 #body.is-preload #header {
			-moz-filter: blur(0.125rem);
			-webkit-filter: blur(0.125rem);
			-ms-filter: blur(0.125rem);
			filter: blur(0.125rem);
		}

			 #body.is-preload #header > * {
				opacity: 0;
			}

			 #body.is-preload #header .content .inner {
				max-height: 0;
				padding-top: 0;
				padding-bottom: 0;
				opacity: 0;
			}

	a {
		-moz-transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out;
		-webkit-transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out;
		-ms-transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out;
		transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out;
		border-bottom: dotted 1px rgba(255, 255, 255, 0.5);
		text-decoration: none;
		color: inherit;
	}

		a:hover {
			border-bottom-color: transparent;
		}

  	h1, h2, h3, h4, h5, h6 {
		color: #ffffff;
		font-weight: 600;
		line-height: 1.5;
		margin: 0 0 1rem 0;
		text-transform: uppercase;
		letter-spacing: 0.2rem;
	}

		h1 a, h2 a, h3 a, h4 a, h5 a, h6 a {
			color: inherit;
			text-decoration: none;
		}

		h1.major, h2.major, h3.major, h4.major, h5.major, h6.major {
			border-bottom: solid 1px #ffffff;
			width: -moz-max-content;
			width: -webkit-max-content;
			width: -ms-max-content;
			width: max-content;
			padding-bottom: 0.5rem;
			margin: 0 0 2rem 0;
		}

	h1 {
		font-size: 2.25rem;
		line-height: 1.3;
		letter-spacing: 0.5rem;
	}

	h2 {
		font-size: 1.5rem;
		line-height: 1.4;
		letter-spacing: 0.5rem;
	}

	h3 {
		font-size: 1rem;
	}

	h4 {
		font-size: 0.8rem;
	}

	h5 {
		font-size: 0.7rem;
	}

	h6 {
		font-size: 0.6rem;
	}

	@media screen and (max-width: 736px) {

		h1 {
			font-size: 1.75rem;
			line-height: 1.4;
		}

		h2 {
			font-size: 1.25em;
			line-height: 1.5;
		}

	}

	sub {
		font-size: 0.8rem;
		position: relative;
		top: 0.5rem;
	}

	sup {
		font-size: 0.8rem;
		position: relative;
		top: -0.5rem;
	}

	blockquote {
		border-left: solid 4px #ffffff;
		font-style: italic;
		margin: 0 0 2rem 0;
		padding: 0.5rem 0 0.5rem 2rem;
	}

	code {
		background: rgba(255, 255, 255, 0.075);
		border-radius: 4px;
		font-family: "Courier New", monospace;
		font-size: 0.9rem;
		margin: 0 0.25rem;
		padding: 0.25rem 0.65rem;
	}

	pre {
		-webkit-overflow-scrolling: touch;
		font-family: "Courier New", monospace;
		font-size: 0.9rem;
		margin: 0 0 2rem 0;
	}

		pre code {
			display: block;
			line-height: 1.75;
			padding: 1rem 1.5rem;
			overflow-x: auto;
		}

	hr {
		border: 0;
		border-bottom: solid 1px #ffffff;
		margin: 2.75rem 0;
	}

	.align-left {
		text-align: left;
	}

	.align-center {
		text-align: center;
	}

	.align-right {
		text-align: right;
	}

/* Main */

	#main {
		-moz-flex-grow: 1;
		-webkit-flex-grow: 1;
		-ms-flex-grow: 1;
		flex-grow: 1;
		-moz-flex-shrink: 1;
		-webkit-flex-shrink: 1;
		-ms-flex-shrink: 1;
		flex-shrink: 1;
		display: -moz-flex;
		display: -webkit-flex;
		display: -ms-flex;
		display: flex;
		-moz-align-items: center;
		-webkit-align-items: center;
		-ms-align-items: center;
		align-items: center;
		-moz-justify-content: center;
		-webkit-justify-content: center;
		-ms-justify-content: center;
		justify-content: center;
		-moz-flex-direction: column;
		-webkit-flex-direction: column;
		-ms-flex-direction: column;
		flex-direction: column;
		position: relative;
		max-width: 100%;
		z-index: 3;
	}

/* BG */
	#bg {
		-moz-transform: scale(1.0);
		-webkit-transform: scale(1.0);
		-ms-transform: scale(1.0);
		transform: scale(1.0);
		-webkit-backface-visibility: hidden;
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100vh;
		z-index: 1;
	}

		#bg:before, #bg:after {
			content: '';
			display: block;
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
		}

		#bg:before {
			-moz-transition: background-color 2.5s ease-in-out;
			-webkit-transition: background-color 2.5s ease-in-out;
			-ms-transition: background-color 2.5s ease-in-out;
			transition: background-color 2.5s ease-in-out;
			-moz-transition-delay: 0.75s;
			-webkit-transition-delay: 0.75s;
			-ms-transition-delay: 0.75s;
			transition-delay: 0.75s;
			background-image: linear-gradient(to top, rgba(19, 21, 25, 0.5), rgba(19, 21, 25, 0.5)), var(--overlay-image);
			background-size: auto, 256px 256px;
			background-position: center, center;
			background-repeat: no-repeat, repeat;
			z-index: 2;
		}

		#bg:after {
			-moz-transform: scale(1.125);
			-webkit-transform: scale(1.125);
			-ms-transform: scale(1.125);
			transform: scale(1.125);
			-moz-transition: -moz-transform 0.325s ease-in-out, -moz-filter 0.325s ease-in-out;
			-webkit-transition: -webkit-transform 0.325s ease-in-out, -webkit-filter 0.325s ease-in-out;
			-ms-transition: -ms-transform 0.325s ease-in-out, -ms-filter 0.325s ease-in-out;
			transition: transform 0.325s ease-in-out, filter 0.325s ease-in-out;
			background-image: var(--background-image);
			background-position: center;
			background-size: cover;
			background-repeat: no-repeat;
			z-index: 1;
		}

		#body.is-article-visible #header {
			-moz-transform: scale(0.95);
			-webkit-transform: scale(0.95);
			-ms-transform: scale(0.95);
			transform: scale(0.95);
			-moz-filter: blur(0.1rem);
			-webkit-filter: blur(0.1rem);
			-ms-filter: blur(0.1rem);
			filter: blur(0.1rem);
			opacity: 0;
		}

		#body.is-article-visible #bg:after {
			-moz-transform: scale(1.0825);
			-webkit-transform: scale(1.0825);
			-ms-transform: scale(1.0825);
			transform: scale(1.0825);
			-moz-filter: blur(0.2rem);
			-webkit-filter: blur(0.2rem);
			-ms-filter: blur(0.2rem);
			filter: blur(0.2rem);
		}

/* Footer */

	#footer {
		-moz-transition: -moz-transform 0.325s ease-in-out, -moz-filter 0.325s ease-in-out, opacity 0.325s ease-in-out;
		-webkit-transition: -webkit-transform 0.325s ease-in-out, -webkit-filter 0.325s ease-in-out, opacity 0.325s ease-in-out;
		-ms-transition: -ms-transform 0.325s ease-in-out, -ms-filter 0.325s ease-in-out, opacity 0.325s ease-in-out;
		transition: transform 0.325s ease-in-out, filter 0.325s ease-in-out, opacity 0.325s ease-in-out;
		width: 100%;
		max-width: 100%;
		margin-top: 2rem;
		text-align: center;
	}

		#footer .copyright {
			letter-spacing: 0.2rem;
			font-size: 0.6rem;
			opacity: 0.75;
			margin-bottom: 0;
			text-transform: uppercase;
		}

		body.is-article-visible #footer {
			-moz-transform: scale(0.95);
			-webkit-transform: scale(0.95);
			-ms-transform: scale(0.95);
			transform: scale(0.95);
			-moz-filter: blur(0.1rem);
			-webkit-filter: blur(0.1rem);
			-ms-filter: blur(0.1rem);
			filter: blur(0.1rem);
			opacity: 0;
		}

		body.is-preload #footer {
			opacity: 0;
		}

/* Type */

	html {
		font-size: 16pt;
	}

		@media screen and (max-width: 1680px) {

			html {
				font-size: 12pt;
			}

		}

		@media screen and (max-width: 736px) {

			html {
				font-size: 11pt;
			}

		}

		@media screen and (max-width: 360px) {

			html {
				font-size: 10pt;
			}

		}

	#body, input, select, textarea {
		color: #ffffff;
		font-family: "Source Sans Pro", sans-serif;
		font-weight: 300;
		font-size: 1rem;
		line-height: 1.65;
	}

	a {
		-moz-transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out;
		-webkit-transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out;
		-ms-transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out;
		transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out;
		border-bottom: dotted 1px rgba(255, 255, 255, 0.5);
		text-decoration: none;
		color: inherit;
	}

		a:hover {
			border-bottom-color: transparent;
		}

	strong, b {
		color: #ffffff;
		font-weight: 600;
	}

	em, i {
		font-style: italic;
	}

	p {
		margin: 0 0 2rem 0;
	}

	h1, h2, h3, h4, h5, h6 {
		color: #ffffff;
		font-weight: 600;
		line-height: 1.5;
		margin: 0 0 1rem 0;
		text-transform: uppercase;
		letter-spacing: 0.2rem;
	}

		h1 a, h2 a, h3 a, h4 a, h5 a, h6 a {
			color: inherit;
			text-decoration: none;
		}

		h1.major, h2.major, h3.major, h4.major, h5.major, h6.major {
			border-bottom: solid 1px #ffffff;
			width: -moz-max-content;
			width: -webkit-max-content;
			width: -ms-max-content;
			width: max-content;
			padding-bottom: 0.5rem;
			margin: 0 0 2rem 0;
		}

	h1 {
		font-size: 2.25rem;
		line-height: 1.3;
		letter-spacing: 0.5rem;
	}

	h2 {
		font-size: 1.5rem;
		line-height: 1.4;
		letter-spacing: 0.5rem;
	}

	h3 {
		font-size: 1rem;
	}

	h4 {
		font-size: 0.8rem;
	}

	h5 {
		font-size: 0.7rem;
	}

	h6 {
		font-size: 0.6rem;
	}

	@media screen and (max-width: 736px) {

		h1 {
			font-size: 1.75rem;
			line-height: 1.4;
		}

		h2 {
			font-size: 1.25em;
			line-height: 1.5;
		}

	}

	sub {
		font-size: 0.8rem;
		position: relative;
		top: 0.5rem;
	}

	sup {
		font-size: 0.8rem;
		position: relative;
		top: -0.5rem;
	}

	blockquote {
		border-left: solid 4px #ffffff;
		font-style: italic;
		margin: 0 0 2rem 0;
		padding: 0.5rem 0 0.5rem 2rem;
	}

	code {
		background: rgba(255, 255, 255, 0.075);
		border-radius: 4px;
		font-family: "Courier New", monospace;
		font-size: 0.9rem;
		margin: 0 0.25rem;
		padding: 0.25rem 0.65rem;
	}

	pre {
		-webkit-overflow-scrolling: touch;
		font-family: "Courier New", monospace;
		font-size: 0.9rem;
		margin: 0 0 2rem 0;
	}

		pre code {
			display: block;
			line-height: 1.75;
			padding: 1rem 1.5rem;
			overflow-x: auto;
		}

	hr {
		border: 0;
		border-bottom: solid 1px #ffffff;
		margin: 2.75rem 0;
	}

	.align-left {
		text-align: left;
	}

	.align-center {
		text-align: center;
	}

	.align-right {
		text-align: right;
	}

/* Form */

	form {
		margin: 0 0 2rem 0;
	}

		form > :last-child {
			margin-bottom: 0;
		}

		form > .fields {
			display: -moz-flex;
			display: -webkit-flex;
			display: -ms-flex;
			display: flex;
			-moz-flex-wrap: wrap;
			-webkit-flex-wrap: wrap;
			-ms-flex-wrap: wrap;
			flex-wrap: wrap;
			width: calc(100% + 3rem);
			margin: -1.5rem 0 2rem -1.5rem;
		}

			form > .fields > .field {
				-moz-flex-grow: 0;
				-webkit-flex-grow: 0;
				-ms-flex-grow: 0;
				flex-grow: 0;
				-moz-flex-shrink: 0;
				-webkit-flex-shrink: 0;
				-ms-flex-shrink: 0;
				flex-shrink: 0;
				padding: 1.5rem 0 0 1.5rem;
				width: calc(100% - 1.5rem);
			}

				form > .fields > .field.half {
					width: calc(50% - 0.75rem);
				}

				form > .fields > .field.third {
					width: calc(100%/3 - 0.5rem);
				}

				form > .fields > .field.quarter {
					width: calc(25% - 0.375rem);
				}

		@media screen and (max-width: 480px) {

			form > .fields {
				width: calc(100% + 3rem);
				margin: -1.5rem 0 2rem -1.5rem;
			}

				form > .fields > .field {
					padding: 1.5rem 0 0 1.5rem;
					width: calc(100% - 1.5rem);
				}

					form > .fields > .field.half {
						width: calc(100% - 1.5rem);
					}

					form > .fields > .field.third {
						width: calc(100% - 1.5rem);
					}

					form > .fields > .field.quarter {
						width: calc(100% - 1.5rem);
					}

		}

	label {
		color: #ffffff;
		display: block;
		font-size: 0.8rem;
		font-weight: 300;
		letter-spacing: 0.2rem;
		line-height: 1.5;
		margin: 0 0 1rem 0;
		text-transform: uppercase;
	}

	input[type="text"],
	input[type="password"],
	input[type="email"],
	input[type="tel"],
	select,
	textarea {
		-moz-appearance: none;
		-webkit-appearance: none;
		-ms-appearance: none;
		appearance: none;
		-moz-transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out;
		-webkit-transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out;
		-ms-transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out;
		transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out;
		background-color: transparent;
		border-radius: 4px;
		border: solid 1px #ffffff;
		color: inherit;
		display: block;
		outline: 0;
		padding: 0 1rem;
		text-decoration: none;
		width: 100%;
	}

		input[type="text"]:invalid,
		input[type="password"]:invalid,
		input[type="email"]:invalid,
		input[type="tel"]:invalid,
		select:invalid,
		textarea:invalid {
			box-shadow: none;
		}

		input[type="text"]:focus,
		input[type="password"]:focus,
		input[type="email"]:focus,
		input[type="tel"]:focus,
		select:focus,
		textarea:focus {
			background: rgba(255, 255, 255, 0.075);
			border-color: #ffffff;
			box-shadow: 0 0 0 1px #ffffff;
		}

	select {
		background-image: url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' preserveAspectRatio='none' viewBox='0 0 40 40'%3E%3Cpath d='M9.4,12.3l10.4,10.4l10.4-10.4c0.2-0.2,0.5-0.4,0.9-0.4c0.3,0,0.6,0.1,0.9,0.4l3.3,3.3c0.2,0.2,0.4,0.5,0.4,0.9 c0,0.4-0.1,0.6-0.4,0.9L20.7,31.9c-0.2,0.2-0.5,0.4-0.9,0.4c-0.3,0-0.6-0.1-0.9-0.4L4.3,17.3c-0.2-0.2-0.4-0.5-0.4-0.9 c0-0.4,0.1-0.6,0.4-0.9l3.3-3.3c0.2-0.2,0.5-0.4,0.9-0.4S9.1,12.1,9.4,12.3z' fill='%23ffffff' /%3E%3C/svg%3E");
		background-size: 1.25rem;
		background-repeat: no-repeat;
		background-position: calc(100% - 1rem) center;
		height: 2.75rem;
		padding-right: 2.75rem;
		text-overflow: ellipsis;
	}

		select option {
			color: #ffffff;
			background: #1b1f22;
		}

		select:focus::-ms-value {
			background-color: transparent;
		}

		select::-ms-expand {
			display: none;
		}

	input[type="text"],
	input[type="password"],
	input[type="email"],
	select {
		height: 2.75rem;
	}

	textarea {
		padding: 0.75rem 1rem;
	}

	input[type="checkbox"],
	input[type="radio"] {
		-moz-appearance: none;
		-webkit-appearance: none;
		-ms-appearance: none;
		appearance: none;
		display: block;
		float: left;
		margin-right: -2rem;
		opacity: 0;
		width: 1rem;
		z-index: -1;
	}

		input[type="checkbox"] + label,
		input[type="radio"] + label {
			text-decoration: none;
			-moz-user-select: none;
			-webkit-user-select: none;
			-ms-user-select: none;
			user-select: none;
			color: #ffffff;
			cursor: pointer;
			display: inline-block;
			font-size: 0.8rem;
			font-weight: 300;
			margin: 0 0 0.5rem 0;
			padding-left: 2.65rem;
			padding-right: 0.75rem;
			position: relative;
		}

			input[type="checkbox"] + label:before,
			input[type="radio"] + label:before {
				-moz-osx-font-smoothing: grayscale;
				-webkit-font-smoothing: antialiased;
				display: inline-block;
				font-style: normal;
				font-variant: normal;
				text-rendering: auto;
				line-height: 1;
				text-transform: none !important;
				font-family: 'Font Awesome 5 Free';
				font-weight: 900;
			}

			input[type="checkbox"] + label:before,
			input[type="radio"] + label:before {
				-moz-transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out;
				-webkit-transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out;
				-ms-transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out;
				transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, background-color 0.2s ease-in-out;
				border-radius: 4px;
				border: solid 1px #ffffff;
				content: '';
				display: inline-block;
				height: 1.65rem;
				left: 0;
				line-height: 1.65rem;
				position: absolute;
				text-align: center;
				top: -0.15rem;
				width: 1.65rem;
			}

		input[type="checkbox"]:checked + label:before,
		input[type="radio"]:checked + label:before {
			background: #ffffff !important;
			border-color: #ffffff !important;
			color: #1b1f22;
			content: '\f00c';
		}

		input[type="checkbox"]:focus + label:before,
		input[type="radio"]:focus + label:before {
			background: rgba(255, 255, 255, 0.075);
			border-color: #ffffff;
			box-shadow: 0 0 0 1px #ffffff;
		}

	input[type="checkbox"] + label:before {
		border-radius: 4px;
	}

	input[type="radio"] + label:before {
		border-radius: 100%;
	}

	::-webkit-input-placeholder {
		color: rgba(255, 255, 255, 0.5) !important;
		opacity: 1.0;
	}

	:-moz-placeholder {
		color: rgba(255, 255, 255, 0.5) !important;
		opacity: 1.0;
	}

	::-moz-placeholder {
		color: rgba(255, 255, 255, 0.5) !important;
		opacity: 1.0;
	}

	:-ms-input-placeholder {
		color: rgba(255, 255, 255, 0.5) !important;
		opacity: 1.0;
	}

	.formerize-placeholder {
		color: rgba(255, 255, 255, 0.5) !important;
		opacity: 1.0;
	}

/* Box */

	.box {
		border-radius: 4px;
		border: solid 1px #ffffff;
		margin-bottom: 2rem;
		padding: 1.5em;
	}

		.box > :last-child,
		.box > :last-child > :last-child,
		.box > :last-child > :last-child > :last-child {
			margin-bottom: 0;
		}

		.box.alt {
			border: 0;
			border-radius: 0;
			padding: 0;
		}

</style>
