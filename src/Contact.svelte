<script>
    import Page from './Page.svelte';

    const socials = [
        { icon: 'twitter', 'url': 'https://twitter.com/AMoonens'},
        { icon: 'github', 'url': 'https://github.com/arnomoonens'},
        { icon: 'linkedin', 'url': 'https://www.linkedin.com/in/arnomoonens'},
    ];

    let name = '';
    let email = '';
    let message = '';

    $: disabled = (name == '') || (email == '') || (message == '');

</script>

<Page on:close>
    <h2 class="major">Contact</h2>
    <form method="POST" action="https://formspree.io/arno.moonens@outlook.com">
        <div class="fields">
            <div class="field half">
                <label for="name">Name</label>
                <input type="text" name="name" id="name" bind:value={name}/>
            </div>
            <div class="field half">
                <label for="email">Email</label>
                <input type="email" name="_replyto" id="email" bind:value={email} />
            </div>
            <div class="field">
                <label for="message">Message</label>
                <textarea name="message" id="message" rows="4" bind:value={message}></textarea>
            </div>
        </div>
        {#if disabled}
            <p>Please fill in all the fields before submitting.</p>
        {/if}
        <ul class="actions">
            <li><input type="submit" {disabled} value="Send Message" class="primary" class:disabled /></li>
            <li><input type="reset" value="Reset" /></li>
        </ul>
    </form>
    <ul class="icons">
        {#each socials as { icon, url }}
            <li><a href="{url}"><i class="icon fa-brands fa-{icon}"></i></a></li>
        {/each}
    </ul>
</Page>

<style>
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
</style>
