import { aggregatePagination, pagination, api, parseContent } from './util';
import infoboxParser from 'infobox-parser';
import { parseCoordinates } from './coordinates';

const get = (obj, first, ...rest) => {
	if (obj === undefined || first === undefined) return obj;
	if (typeof first === 'function') {
		return get(first(obj), ...rest);
	}
	return get(obj[first], ...rest);
};

const firstValue = obj => {
	if (typeof obj === 'object') return obj[Object.keys(obj)[0]];
	return obj[0];
};

const getFileName = text => {
	if (Array.isArray(text)) text = text[0];
	if (!text) return undefined;
	if (text.indexOf(':') !== -1) {
		const [, name] = text.split(':');
		return name;
	}
	return text;
};

/**
 * WikiPage
 * @namespace WikiPage
 */
export default function wikiPage(rawPageInfo, apiOptions) {
	const raw = rawPageInfo;

	/**
	 * HTML from page
	 * @example
	 * wiki.page('batman').then(page => page.html()).then(console.log);
	 * @method WikiPage#html
	 * @return {Promise}
	 */
	function html() {
		return api(apiOptions, {
			prop: 'revisions',
			rvprop: 'content',
			rvlimit: 1,
			rvparse: '',
			titles: raw.title
		}).then(res => res.query.pages[raw.pageid].revisions[0]['*']);
	}

	/**
	 * @summary Useful for extracting structured section content from the page
	 * @alias sections
	 * @example
	 * wiki.page('batman').then(page => page.content()).then(console.log);
	 * @method WikiPage#content
	 * @return {Promise}
	 */
	function content() {
		return rawContent().then(parseContent);
	}

	/**
	 * Raw content from page
	 * @example
	 * wiki.page('batman').then(page => page.rawContent()).then(console.log);
	 * @method WikiPage#rawContent
	 * @return {Promise}
	 */
	function rawContent() {
		return api(apiOptions, {
			prop: 'extracts',
			explaintext: '',
			titles: raw.title
		}).then(res => res.query.pages[raw.pageid].extract);
	}

	/**
	 * Text summary from page
	 * @example
	 * wiki.page('batman').then(page => page.summary()).then(console.log);
	 * @method WikiPage#summary
	 * @return {Promise}
	 */
	function summary() {
		return api(apiOptions, {
			prop: 'extracts',
			explaintext: '',
			exintro: '',
			titles: raw.title
		}).then(res => res.query.pages[raw.pageid].extract);
	}

	/**
	 * Raw data from images from page
	 * @example
	 * wiki.page('batman').then(page => page.rawImages()).then(console.log);
	 * @method WikiPage#rawImages
	 * @return {Promise}
	 */
	function rawImages() {
		return api(apiOptions, {
			generator: 'images',
			gimlimit: 'max',
			prop: 'imageinfo',
			iiprop: 'url',
			titles: raw.title
		}).then(res => {
			if (res.query) {
				return Object.keys(res.query.pages).map(id => res.query.pages[id]);
			}
			return [];
		});
	}

	/**
	 * Main image URL from infobox on page
	 * @example
	 * wiki.page('batman').then(page => page.mainImage()).then(console.log);
	 * @method WikiPage#mainImage
	 * @return {Promise}
	 */
	function mainImage() {
		return Promise.all([rawImages(), info()]).then(([images, info]) => {
			// Handle different translations of "image" here
			const mainImageName = getFileName(
				info.image ||
					info.bildname ||
					info.imagen ||
					info.Immagine ||
					info.badge ||
					info.logo
			);
			// Handle case where no info box exists
			if (!mainImageName) {
				return rawInfo().then(text => {
					if (!images.length) return undefined;
					// Sort images by what is seen first in page's info text
					images.sort((a, b) => text.indexOf(b.title) - text.indexOf(a.title));
					const image = images[0];
					return image.imageinfo.length > 0
						? image.imageinfo[0].url
						: undefined;
				});
			}
			const image = images.find(({ title }) => {
				const filename = getFileName(title);
				// Some wikis use underscores for spaces, some don't
				return (
					filename === mainImageName ||
					filename.replace(/\s/g, '_') === mainImageName
				);
			});
			return image && image.imageinfo.length > 0
				? image.imageinfo[0].url
				: undefined;
		});
	}

	/**
	 * Image URL's from page
	 * @example
	 * wiki.page('batman').then(page => page.image()).then(console.log);
	 * @method WikiPage#images
	 * @return {Promise}
	 */
	function images() {
		return rawImages().then(images => {
			return images
				.map(image => image.imageinfo)
				.reduce((imageInfos, list) => [...imageInfos, ...list], [])
				.map(info => info.url);
		});
	}

	/**
	 * References from page
	 * @example
	 * wiki.page('batman').then(page => page.references()).then(console.log);
	 * @method WikiPage#references
	 * @return {Promise}
	 */
	function references() {
		return api(apiOptions, {
			prop: 'extlinks',
			ellimit: 'max',
			titles: raw.title
		}).then(res => res.query.pages[raw.pageid].extlinks.map(link => link['*']));
	}

	/**
	 * Paginated links from page
	 * @example
	 * wiki.page('batman').then(page => page.links()).then(console.log);
	 * @method WikiPage#links
	 * @param  {Boolean} [aggregated] - return all links (default is true)
	 * @param  {Number} [limit] - number of links per page
	 * @return {Promise} - returns results if aggregated [and next function for more results if not aggregated]
	 */
	function links(aggregated = true, limit = 100) {
		const _pagination = pagination(
			apiOptions,
			{
				prop: 'links',
				plnamespace: 0,
				pllimit: limit,
				titles: raw.title
			},
			res => res.query.pages[raw.pageid].links.map(link => link.title)
		);
		if (aggregated) {
			return aggregatePagination(_pagination);
		}
		return _pagination;
	}

	/**
	 * Paginated categories from page
	 * @example
	 * wiki.page('batman').then(page => page.categories()).then(console.log);
	 * @method WikiPage#categories
	 * @param  {Boolean} [aggregated] - return all categories (default is true)
	 * @param  {Number} [limit] - number of categories per page
	 * @return {Promise} - returns results if aggregated [and next function for more results if not aggregated]
	 */
	function categories(aggregated = true, limit = 100) {
		const _pagination = pagination(
			apiOptions,
			{
				prop: 'categories',
				pllimit: limit,
				titles: raw.title
			},
			res =>
				res.query.pages[raw.pageid].categories.map(category => category.title)
		);
		if (aggregated) {
			return aggregatePagination(_pagination);
		}
		return _pagination;
	}

	/**
	 * Geographical coordinates from page
	 * @example
	 * wiki().page('Texas').then(texas => texas.coordinates())
	 * @method WikiPage#coordinates
	 * @return {Promise}
	 */
	function coordinates() {
		return api(apiOptions, {
			prop: 'coordinates',
			titles: raw.title
		}).then(res => {
			const page = res.query.pages[raw.pageid];
			if (page.coordinates) {
				return page.coordinates[0];
			}
			// No coordinates for this page, check infobox for deprecated version
			return info().then(data => parseCoordinates(data));
		});
	}

	function rawInfo(title) {
		return api(apiOptions, {
			prop: 'revisions',
			rvprop: 'content',
			rvsection: 0,
			titles: title || raw.title
		}).then(res => get(res, 'query', 'pages', firstValue, 'revisions', 0, '*'));
	}

	/**
	 * Fetch and parse tables within page
	 * @method WikiPage#tables
	 * @return {Promise} Resolves to a collection of tables
	 */
	function tables() {
		return api(apiOptions, {
			prop: 'revisions',
			rvprop: 'content',
			titles: raw.title
		})
			.then(res => get(res, 'query', 'pages', firstValue, 'revisions', 0, '*'))
			.then(wikitext => infoboxParser(wikitext, apiOptions.parser).tables);
	}

	/**
	 * Get general information from page, with optional specifc property
	 * @deprecated This method will be dropped and replaced with the `fullInfo` implementation in v5
	 * @example
	 * new Wiki().page('Batman').then(page => page.info('alter_ego'));
	 * @method WikiPage#info
	 * @param  {String} [key] - Information key. Falsy keys are ignored
	 * @return {Promise} - info Object contains key/value pairs of infobox data, or specific value if key given
	 */
	function info(key) {
		return rawInfo()
			.then(wikitext => {
				// Use general data for now...
				const info = infoboxParser(wikitext, apiOptions.parser).general;
				if (Object.keys(info).length === 0) {
					// If empty, check to see if this page has a templated infobox
					return rawInfo(`Template:Infobox ${raw.title.toLowerCase()}`).then(
						_wikitext =>
							infoboxParser(_wikitext || '', apiOptions.parser).general
					);
				}
				return info;
			})
			.then(metadata => {
				if (!key) {
					return metadata;
				}
				if (metadata.hasOwnProperty(key)) {
					return metadata[key];
				}
			});
	}

	/**
	 * Get the full infobox data, parsed in a easy to use manner
	 * @example
	 * new Wiki().page('Batman').then(page => page.fullInfo()).then(info => info.general.aliases);
	 * @method WikiPage#fullInfo
	 * @return {Promise} - Parsed object of all infobox data
	 */
	function fullInfo() {
		return rawInfo().then(wikitext =>
			infoboxParser(wikitext, apiOptions.parser)
		);
	}

	/**
	 * Paginated backlinks from page
	 * @method WikiPage#backlinks
	 * @param  {Boolean} [aggregated] - return all backlinks (default is true)
	 * @param  {Number} [limit] - number of backlinks per page
	 * @return {Promise} - includes results [and next function for more results if not aggregated]
	 */
	function backlinks(aggregated = true, limit = 100) {
		const _pagination = pagination(
			apiOptions,
			{
				list: 'backlinks',
				bllimit: limit,
				bltitle: raw.title
			},
			res => res.query.backlinks.map(link => link.title)
		);
		if (aggregated) {
			return aggregatePagination(_pagination);
		}
		return _pagination;
	}

	/**
	 * Get list of links to different translations
	 * @method WikiPage#langlinks
	 * @return {Promise} - includes link objects { lang, title }
	 */
	function langlinks() {
		return api(apiOptions, {
			prop: 'langlinks',
			lllimit: 'max',
			titles: raw.title
		}).then(res =>
			res.query.pages[raw.pageid].langlinks.map(link => {
				return {
					lang: link.lang,
					title: link['*']
				};
			})
		);
	}

	/**
	 * Get URL for wiki page
	 * @method WikiPage#url
	 * @return {URL}
	 */
	function url() {
		return raw.canonicalurl;
	}

	const page = {
		raw,
		html,
		rawContent,
		content,
		sections: content,
		summary,
		images,
		references,
		links,
		categories,
		coordinates,
		info,
		backlinks,
		rawImages,
		mainImage,
		langlinks,
		rawInfo,
		fullInfo,
		tables,
		url
	};

	return page;
}
