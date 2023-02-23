Array.prototype.last = function( ) {

	return this[ this.length - 1 ];

}

const os = require( 'os' );
const fs = require( 'fs' );
const HTMLParser = require( 'node-html-parser' );
const https = require( 'https' );
const readline = require( 'readline' );
const { performance } = require( 'perf_hooks' );

const threads = os.cpus( ).length;

if( !fs.existsSync( './res/' ) ) fs.mkdirSync( './res/' );

const rl = readline.createInterface( {

	input: process.stdin,
	output: process.stdout

} );

const blacklist = [ 'furry_male', 'furry_only', 'furry' ];

const options = {

	headers: {

		Cookie: `resize-original=1; gdpr=1; tag_blacklist=${ escape( escape( blacklist.join( ' ' ) ) ) }`

	}

};

( async( ) => {

	const downloadPosts = async ( ) => {

		let index = 0;
		let working = 0;
		let finished = 0;

		let speed = 0;
		let downloaded = 0;

		setInterval( ( ) => {

			speed = Math.round( downloaded );
			downloaded = 0;

		}, 1000 );

		const maxWorkers = ( postIDs.length > threads * 10 ) ? threads * 10 : postIDs.length;

		const beginStamp = performance.now( );

		const download = async ( index, callback ) => {

			const retry = ( ) => {

				try {

					fetch( `https://rule34.xxx/index.php?page=post&s=view&id=${ postIDs[ index ] }`, options ).then( response => response.text( ) ).then( text => {

						const html = HTMLParser.parse( text );

						let src;

						if( html.querySelector( '#image' ) ) src = html.querySelector( '#image' ).getAttribute( 'src' );
						if( html.querySelector( 'source' ) ) src = html.querySelector( 'source' ).getAttribute( 'src' );

						if( !src ) {

							setTimeout( ( ) => retry( ), 2500 );

							return;

						}

						let filename = src.split( '/' ).last( ).split( '?' )[ 0 ];

						let tempData = '';
						let fileStream = fs.createWriteStream( `./res/${ filename }` );

						const req = https.get( src, res => {

							const size = res.headers[ 'content-length' ];

							res.pipe( fileStream );

							if( tempData.length < 250 ) res.on( 'data', data => tempData += data );

							res.on( 'end', ( ) => {

								if( tempData.includes( '503 Service Temporarily Unavailable' ) ) {

									setTimeout( ( ) => retry( ), 2500 );

									return;

								} else {

									fileStream.close( );
									downloaded += size / 1_000_000;

									callback( filename );

									return;

								}

							} );

						} );

						req.on( 'error', err => setTimeout( ( ) => retry( ), 2500 ) );

					} ).catch( err => setTimeout( ( ) => retry( ), 2500 ) );

				} catch( error ) {

					setTimeout( ( ) => retry( ), 2500 );

				}

			}

			retry( );

		}

		const downloadCycle = ( ) => {

			working++;

			const ownIndex = index;

			download( ownIndex, filename => {

				finished++;
				working--;

				const statusStr = Array( process.stdout.columns ).fill( ' ' );
				const wStr = `Downloaded ${ Math.floor( ( ( finished ) / postIDs.length ) * 100 ) }% (${ finished }/${ postIDs.length }): [${ postIDs[ ownIndex ] }] => ${ filename }`;
				const timeStr = `Elapsed: ${ ( ( performance.now( ) - beginStamp ) / 1000 / 60 ).toFixed( 2 ) } min | ETA: ${ Math.round( ( ( ( finished / ( performance.now( ) - beginStamp ) ) * postIDs.length ) - ( performance.now( ) - beginStamp ) / 1000 / 60 ) ) } min | Speed: ${ speed }MB/s | Workers: ${ working }/${ maxWorkers }`;

				statusStr[ 0 ] = '\r';
				[ ... wStr ].forEach( ( c, cindex ) => statusStr[ cindex + 1 ] = c );
				[ ... timeStr ].reverse( ).forEach( ( c, cindex ) => statusStr[ statusStr.length - cindex - 1 ] = c );

				process.stdout.write( `${ statusStr.join( '' ) }` );

				if( index < postIDs.length ) {

					downloadCycle( );
					index++;

				} else {

					if( working == 0 ) {

						process.stdout.write( '\nAll downloaded.' );

						process.exit( );

					}

				}

			} );

		}

		for( let i = 0; i < maxWorkers; i++ ) {

			downloadCycle( );
			index++;

		}

	}

	let input = ( await new Promise( resolve => {

		rl.question( 'Tags: ', resolve );

	} ) ).replaceAll( ' ', '+' );

	const searchHTML = HTMLParser.parse( await ( await fetch( `https://rule34.xxx/index.php?page=post&s=list&tags=${ escape( input ) }`, options ) ).text( ) );

	const totalPages = searchHTML.querySelector( 'a[alt="last page"]' ) ? Math.round( searchHTML.querySelector( 'a[alt="last page"]' ).getAttribute( 'href' ).split( '&pid=' ).last( ) / 42 ) : 0

	const postIDs = [ ... searchHTML.querySelectorAll( 'div.image-list > span > a' ).map( a => a.getAttribute( 'href' ).split( '&id=' ).last( ) ) ];

	let parsed = 0;
	let ignored = 0;

	const parsePages = ( ) => {

		if( totalPages == 0 ) {

			downloadPosts( );

			return;

		}

		process.stdout.write( `\rParsing page ${ parsed }/${ totalPages } (${ Math.round( ( parsed / totalPages ) * 100 ) }%) [${ postIDs.length } gathered | ${ ignored } ignored]` ); 

		if( parsed >= totalPages ) {

			console.log( `\nParsed ${ parsed } pages, got total of ${ postIDs.length } post IDs` );

			downloadPosts( );

			return;

		}

		parsed++;

		fetch( `https://rule34.xxx/index.php?page=post&s=list&tags=${ escape( input ) }&pid=${ parsed * 42 }`, options ).then( response => response.text( ) ).then( text => {

			let posts = ( HTMLParser.parse( text ) ).querySelectorAll( 'div.image-list > span' ).filter( span => {

				if( span.classList.contains( 'blacklisted-image' ) ) {

					ignored++;
					return false;

				}

				return true;

			} ).map( span => {

				return span.querySelector( 'a' ).getAttribute( 'href' ).split( '&id=' ).last( );

			} );

			postIDs.push( ... posts );

			parsePages( );

		} );

	}

	parsePages( );

} )( );
