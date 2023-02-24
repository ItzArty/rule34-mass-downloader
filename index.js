Array.prototype.last = function( ) {

	return this[ this.length - 1 ];

}

const remainderUnits = [ 'ms', 's', 'm', 'h', 'd' ];

const formatRemainder = ms => {

	let remainder = ms / 1000;

	let slaveRemainder = 0;

	let level = 0;

	// S -> M

	if( remainder > 60 ) {

		level++;

		remainder /= 60

		slaveRemainder = ( remainder % 1 ) * 60

	}

	// M -> H

	if( remainder > 60 && level == 1 ) {

		level++;

		remainder /= 60

		slaveRemainder = ( remainder % 1 ) * 60

	}

	// H -> D

	if( remainder > 24 && level == 2 ) {

		level++;

		remainder /= 24

		slaveRemainder = ( remainder % 1 ) * 24

	}

	return `${ Math.floor( remainder ) }${ remainderUnits[ level + 1 ] }${ level > 0 && Math.round( slaveRemainder ) > 0 ? ` ${ Math.round( slaveRemainder ) }${ remainderUnits[ level ] }` : '' }`

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

	console.clear( );

	const downloadPosts = async ( ) => {

		let index = 0;
		let working = 0;
		let finished = 0;

		let throughput = { };

		let averageSpeed = 0;
		let averageSpeedSnaps = 0;

		const maxWorkers = ( postIDs.length > threads * 10 ) ? threads * 10 : postIDs.length;

		const beginStamp = performance.now( );

		const download = async ( index, callback ) => {

			const retry = async repeated => {

				if( repeated ) await new Promise( r => setTimeout( r, 2500 ) );

				try {

					fetch( `https://rule34.xxx/index.php?page=post&s=view&id=${ postIDs[ index ] }`, options ).then( response => response.text( ) ).then( text => {

						const html = HTMLParser.parse( text );

						let src;

						if( html.querySelector( '#image' ) ) src = html.querySelector( '#image' ).getAttribute( 'src' );
						if( html.querySelector( 'source' ) ) src = html.querySelector( 'source' ).getAttribute( 'src' );

						if( !src ) {

							retry( true );

							return;

						}

						let filename = src.split( '/' ).last( ).split( '?' )[ 0 ];

						let tempData = '';
						let fileStream = fs.createWriteStream( `./res/${ filename }` );

						const req = https.get( src, res => {

							const size = res.headers[ 'content-length' ];

							if( res.statusCode != 200 ) {

								console.log( res.statusCode );

								retry( true );

								return;

							}

							res.on( 'data', data => throughput[ performance.now( ) ] = data.length );

							res.pipe( fileStream );

							res.on( 'end', ( ) => {

								fileStream.close( );
								callback( filename );

								return;

							} );

						} );

						req.on( 'error', err => retry( true ) );

					} ).catch( err => retry( true ) );

				} catch( error ) {

					retry( true );

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

				if( index < postIDs.length ) {

					downloadCycle( );
					index++;

				}

			} );

		}

		for( let i = 0; i < maxWorkers; i++ ) {

			downloadCycle( );
			index++;

		}

		const workingInterval = setInterval( ( ) => {

			const speed = Math.round( Object.keys( throughput ).filter( stamp => {

				if( stamp > performance.now( ) - 1000 ) return true;

				delete throughput[ stamp ];
				return false;

			} ).map( bytes => bytes = throughput[ bytes ] ).reduce( ( total, bytes ) => total + bytes, 0 ) / 1_000_000 );

			averageSpeedSnaps++;
			averageSpeed = ( averageSpeed + speed ) / averageSpeedSnaps;

			const elapsed = performance.now( ) - beginStamp;
			let eta = ( ( postIDs.length - finished ) / averageSpeed ) * 1000;

			const statusStr = Array( process.stdout.columns ).fill( ' ' );
			const wStr = `Downloaded ${ Math.floor( ( ( finished ) / postIDs.length ) * 100 ) }% (${ finished }/${ postIDs.length })`;
			const timeStr = `Elapsed: ${ formatRemainder( elapsed ) } | ETA: ${ formatRemainder( eta ) } | Speed: ${ speed }MB/s | Workers: ${ working }/${ maxWorkers }`;

			statusStr[ 0 ] = '\r';
			[ ... wStr ].forEach( ( c, cindex ) => statusStr[ cindex + 1 ] = c );
			[ ... timeStr ].reverse( ).forEach( ( c, cindex ) => statusStr[ statusStr.length - cindex - 1 ] = c );

			process.stdout.write( `${ statusStr.join( '' ) }` );

			if( finished == postIDs.length ) {

				process.stdout.write( '\nAll downloaded.' );

				process.exit( );

			}

		}, 500 );

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
