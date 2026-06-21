<?php
/**
 * Plugin Name:       Twomilia AI Agent
 * Plugin URI:        https://twomilia.com
 * Description:       Adds the Twomilia AI agent (in-page copilot + customer-support widget) to your WordPress site. Loads twomilia.js from the CDN and initializes it from your saved settings. The agent renders its own shadow-DOM chat overlay — this plugin only configures and loads it.
 * Version:           1.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.2
 * Author:            Twomilia
 * Author URI:        https://twomilia.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       twomilia
 *
 * This is a THIN loader. It does NOT bundle the agent runtime — the runtime
 * stays on the CDN (like Stripe.js). On the front end it enqueues twomilia.js
 * in the footer and calls Twomilia.init({...}) with config built from the
 * options saved on Settings -> Twomilia.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

if ( ! defined( 'TWOMILIA_VERSION' ) ) {
	define( 'TWOMILIA_VERSION', '1.1.0' );
}
if ( ! defined( 'TWOMILIA_OPTION' ) ) {
	define( 'TWOMILIA_OPTION', 'twomilia_settings' );
}
if ( ! defined( 'TWOMILIA_SCRIPT_SRC' ) ) {
	// Override with: define( 'TWOMILIA_SCRIPT_SRC', '...' ); in wp-config.php for self-hosting.
	define( 'TWOMILIA_SCRIPT_SRC', 'https://twomilia.com/twomilia.js' );
}

/**
 * Default settings. Mirrors the optional fields of TwomiliaConfig that this
 * plugin exposes in the admin UI. analyticsKey is the only required field.
 *
 * @return array<string,mixed>
 */
function twomilia_default_settings() {
	return array(
		'analytics_key'     => '',
		'knowledge_base'    => 0,
		'ignore_selectors'  => '',
		'confirm_selectors' => '',
		'woo_defaults'      => 1,
	);
}

/**
 * Read saved settings merged over defaults.
 *
 * @return array<string,mixed>
 */
function twomilia_get_settings() {
	$saved = get_option( TWOMILIA_OPTION, array() );
	if ( ! is_array( $saved ) ) {
		$saved = array();
	}
	return wp_parse_args( $saved, twomilia_default_settings() );
}

/**
 * Parse a comma/newline-separated textarea into a clean list of CSS selectors.
 *
 * @param string $raw Raw textarea value.
 * @return string[]   List of non-empty trimmed selectors.
 */
function twomilia_parse_selectors( $raw ) {
	if ( ! is_string( $raw ) || '' === trim( $raw ) ) {
		return array();
	}
	$parts = preg_split( '/[\r\n,]+/', $raw );
	if ( ! is_array( $parts ) ) {
		return array();
	}
	$out = array();
	foreach ( $parts as $part ) {
		$part = trim( $part );
		if ( '' !== $part ) {
			$out[] = $part;
		}
	}
	return array_values( array_unique( $out ) );
}

/* -------------------------------------------------------------------------
 * Front end: enqueue twomilia.js and init the agent.
 * ---------------------------------------------------------------------- */

/**
 * Enqueue the CDN runtime in the footer and attach an inline Twomilia.init(...)
 * call built from the saved settings. No-ops if no analytics key is set.
 */
function twomilia_enqueue_scripts() {
	$settings = twomilia_get_settings();

	$analytics_key = is_string( $settings['analytics_key'] ) ? trim( $settings['analytics_key'] ) : '';
	if ( '' === $analytics_key ) {
		return; // Nothing to load until a key is configured.
	}

	// Build the config object that maps 1:1 onto TwomiliaConfig.
	$config = array(
		'analyticsKey' => $analytics_key,
	);

	if ( ! empty( $settings['knowledge_base'] ) ) {
		$config['knowledgeBase'] = true;
	}

	$ignore = twomilia_parse_selectors( isset( $settings['ignore_selectors'] ) ? $settings['ignore_selectors'] : '' );
	if ( ! empty( $ignore ) ) {
		$config['ignoreSelectors'] = $ignore;
	}

	$confirm = twomilia_parse_selectors( isset( $settings['confirm_selectors'] ) ? $settings['confirm_selectors'] : '' );
	if ( ! empty( $confirm ) ) {
		$config['confirmSelectors'] = $confirm;
	}

	// WooCommerce-aware defaults. When WooCommerce is active, force a confirmation
	// before money-path controls (place order, checkout, add to cart) and hide
	// billing/payment fields from the agent entirely. Merged with manual selectors.
	if ( ! empty( $settings['woo_defaults'] ) && class_exists( 'WooCommerce' ) ) {
		$woo_confirm = array(
			'#place_order',
			'.checkout-button',
			'.single_add_to_cart_button',
			'.wc-block-cart__submit-button',
			'.wc-block-components-checkout-place-order-button',
		);
		$woo_ignore = array(
			'.woocommerce-billing-fields',
			'.payment_methods',
			'.wc-block-checkout__payment-method',
		);
		$config['confirmSelectors'] = array_values( array_unique( array_merge(
			isset( $config['confirmSelectors'] ) ? $config['confirmSelectors'] : array(),
			$woo_confirm
		) ) );
		$config['ignoreSelectors'] = array_values( array_unique( array_merge(
			isset( $config['ignoreSelectors'] ) ? $config['ignoreSelectors'] : array(),
			$woo_ignore
		) ) );
	}

	/**
	 * Filter the config passed to Twomilia.init(). Themes/plugins can add any
	 * other TwomiliaConfig field here (userContext, accentColor, supportMode...).
	 *
	 * NOTE: customTools have JS `execute` closures that cannot be expressed in
	 * PHP. To register them, enqueue your own small theme JS that calls
	 * Twomilia.init() with the tools (see readme.txt). Server-side config is
	 * still merged because Twomilia.init is idempotent (first call wins),
	 * so load your tool config script before this one if you need tools.
	 *
	 * @param array<string,mixed> $config   Config built from saved settings.
	 * @param array<string,mixed> $settings Raw saved settings.
	 */
	$config = apply_filters( 'twomilia_init_config', $config, $settings );

	$src = TWOMILIA_SCRIPT_SRC;

	// Register + enqueue the CDN runtime in the footer.
	wp_enqueue_script( 'twomilia', $src, array(), null, true );

	$json = wp_json_encode( $config );
	if ( false === $json ) {
		$json = '{}';
	}

	// Guard for the (rare) case the global isn't ready, then init once.
	$inline = 'if (window.Twomilia && typeof window.Twomilia.init === "function") { window.Twomilia.init(' . $json . '); }';

	wp_add_inline_script( 'twomilia', $inline, 'after' );
}
add_action( 'wp_enqueue_scripts', 'twomilia_enqueue_scripts' );

/* -------------------------------------------------------------------------
 * Admin: Settings -> Twomilia.
 * ---------------------------------------------------------------------- */

/**
 * Add the settings submenu under the main Settings menu.
 */
function twomilia_admin_menu() {
	add_options_page(
		__( 'Twomilia', 'twomilia' ),
		__( 'Twomilia', 'twomilia' ),
		'manage_options',
		'twomilia',
		'twomilia_render_settings_page'
	);
}
add_action( 'admin_menu', 'twomilia_admin_menu' );

/**
 * Add a quick "Settings" link on the Plugins list row.
 *
 * @param string[] $links Existing action links.
 * @return string[]
 */
function twomilia_plugin_action_links( $links ) {
	$url  = admin_url( 'options-general.php?page=twomilia' );
	$link = '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'twomilia' ) . '</a>';
	array_unshift( $links, $link );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'twomilia_plugin_action_links' );

/**
 * Sanitize and persist the settings form. Nonce-protected.
 */
function twomilia_handle_save() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have permission to do that.', 'twomilia' ) );
	}

	check_admin_referer( 'twomilia_save_settings', 'twomilia_nonce' );

	$input = wp_unslash( $_POST );

	$settings = array(
		'analytics_key'     => isset( $input['analytics_key'] ) ? sanitize_text_field( $input['analytics_key'] ) : '',
		'knowledge_base'    => ! empty( $input['knowledge_base'] ) ? 1 : 0,
		// Preserve newlines/commas; sanitize_textarea_field strips tags but keeps line breaks.
		'ignore_selectors'  => isset( $input['ignore_selectors'] ) ? sanitize_textarea_field( $input['ignore_selectors'] ) : '',
		'confirm_selectors' => isset( $input['confirm_selectors'] ) ? sanitize_textarea_field( $input['confirm_selectors'] ) : '',
		'woo_defaults'      => ! empty( $input['woo_defaults'] ) ? 1 : 0,
	);

	update_option( TWOMILIA_OPTION, $settings );

	$redirect = add_query_arg(
		array(
			'page'             => 'twomilia',
			'twomilia-updated' => '1',
		),
		admin_url( 'options-general.php' )
	);
	wp_safe_redirect( $redirect );
	exit;
}
add_action( 'admin_post_twomilia_save_settings', 'twomilia_handle_save' );

/**
 * Render the Settings -> Twomilia page.
 */
function twomilia_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$settings = twomilia_get_settings();
	$updated  = isset( $_GET['twomilia-updated'] ) && '1' === $_GET['twomilia-updated']; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	?>
	<div class="wrap">
		<h1><?php echo esc_html__( 'Twomilia AI Agent', 'twomilia' ); ?></h1>

		<?php if ( $updated ) : ?>
			<div class="notice notice-success is-dismissible">
				<p><?php echo esc_html__( 'Settings saved.', 'twomilia' ); ?></p>
			</div>
		<?php endif; ?>

		<p>
			<?php echo esc_html__( 'Paste your publishable Analytics Key and the agent will load on the front end. The widget renders its own chat overlay; nothing else to place in your theme.', 'twomilia' ); ?>
		</p>

		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="twomilia_save_settings" />
			<?php wp_nonce_field( 'twomilia_save_settings', 'twomilia_nonce' ); ?>

			<table class="form-table" role="presentation">
				<tbody>
					<tr>
						<th scope="row">
							<label for="twomilia_analytics_key"><?php echo esc_html__( 'Analytics Key', 'twomilia' ); ?></label>
						</th>
						<td>
							<input
								name="analytics_key"
								id="twomilia_analytics_key"
								type="text"
								class="regular-text"
								autocomplete="off"
								placeholder="twomilia_pub_…"
								value="<?php echo esc_attr( $settings['analytics_key'] ); ?>"
							/>
							<p class="description">
								<?php echo esc_html__( 'Required. From Dashboard → Setup & API Keys.', 'twomilia' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php echo esc_html__( 'Knowledge base', 'twomilia' ); ?></th>
						<td>
							<fieldset>
								<label for="twomilia_knowledge_base">
									<input
										name="knowledge_base"
										id="twomilia_knowledge_base"
										type="checkbox"
										value="1"
										<?php checked( ! empty( $settings['knowledge_base'] ) ); ?>
									/>
									<?php echo esc_html__( 'Ground answers in your dashboard knowledge base', 'twomilia' ); ?>
								</label>
							</fieldset>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php echo esc_html__( 'WooCommerce', 'twomilia' ); ?></th>
						<td>
							<fieldset>
								<label for="twomilia_woo_defaults">
									<input
										name="woo_defaults"
										id="twomilia_woo_defaults"
										type="checkbox"
										value="1"
										<?php checked( ! empty( $settings['woo_defaults'] ) ); ?>
									/>
									<?php echo esc_html__( 'Auto-protect WooCommerce checkout — confirm before place-order / add-to-cart, and hide billing & payment fields from the agent', 'twomilia' ); ?>
								</label>
								<p class="description">
									<?php
									echo class_exists( 'WooCommerce' )
										? esc_html__( 'WooCommerce detected — these defaults apply on top of any selectors above.', 'twomilia' )
										: esc_html__( 'Takes effect automatically when WooCommerce is active.', 'twomilia' );
									?>
								</p>
							</fieldset>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="twomilia_ignore_selectors"><?php echo esc_html__( 'Ignore selectors', 'twomilia' ); ?></label>
						</th>
						<td>
							<textarea
								name="ignore_selectors"
								id="twomilia_ignore_selectors"
								class="large-text code"
								rows="4"
								placeholder=".admin-bar, #wpadminbar, .private"
							><?php echo esc_textarea( $settings['ignore_selectors'] ); ?></textarea>
							<p class="description">
								<?php echo esc_html__( 'CSS selectors hidden from the agent (and their children). One per line, or comma-separated.', 'twomilia' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="twomilia_confirm_selectors"><?php echo esc_html__( 'Confirm selectors', 'twomilia' ); ?></label>
						</th>
						<td>
							<textarea
								name="confirm_selectors"
								id="twomilia_confirm_selectors"
								class="large-text code"
								rows="4"
								placeholder=".checkout-submit, #delete-account"
							><?php echo esc_textarea( $settings['confirm_selectors'] ); ?></textarea>
							<p class="description">
								<?php echo esc_html__( 'CSS selectors that force an approval prompt before the agent acts on them. One per line, or comma-separated.', 'twomilia' ); ?>
							</p>
						</td>
					</tr>
				</tbody>
			</table>

			<?php submit_button( __( 'Save Changes', 'twomilia' ) ); ?>
		</form>

		<hr />
		<p class="description">
			<?php
			echo wp_kses(
				__( 'Need custom tools, voice, support mode, or theming? Those use JavaScript closures, so register them from a small theme script — see the plugin <strong>readme.txt</strong> (“Custom tools”).', 'twomilia' ),
				array( 'strong' => array() )
			);
			?>
		</p>
	</div>
	<?php
}
