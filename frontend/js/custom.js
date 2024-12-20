/* smooth scroll
----------------------------------------------*/
$( function () {
    $( 'a[href*=#]:not([href=#])' ).click( function () {
        if (location.pathname.replace( /^\//, '' ) == this.pathname.replace( /^\//, '' ) || location.hostname == this.hostname) {

            let target = $( this.hash );
            target = target.length ? target : $( '[name=' + this.hash.slice( 1 ) + ']' );
            if (target.length) {
                $( 'html,body' ).animate( {
                    scrollTop: target.offset().top
                }, 1000 );
                return false;
            }
        }
    } );
} );

/* scrollspy 
----------------------------------------------*/
$( 'body' ).scrollspy( {target: '#navbar-scroll'} )

// Closes the Responsive Menu on Menu Item Click
$( '.navbar-collapse ul li a' ).click( function () {
    $( '.navbar-toggle:visible' ).click();
} );

/* carousel 
----------------------------------------------*/
$( document ).ready( function () {
    $( "#screenshots" ).owlCarousel( {
        items: 4, itemsCustom: [[0, 1], [480, 2], [768, 3], [992, 4]],
    } );
    $( "#owl-clients" ).owlCarousel( {
        navigation: false, // Show next and prev buttons
        slideSpeed: 300, autoHeight: true, singleItem: true
    } );
} );


/* sticky navigation
----------------------------------------------*/
$( document ).ready( function () {
    $( "#menu" ).sticky( {topSpacing: 0} );
} );


/* scrollToTop 
----------------------------------------------*/
$( document ).ready( function () {

    //Check to see if the window is top if not then display button
    $( window ).scroll( function () {
        if ($( this ).scrollTop() > 500) {
            $( '.scrollToTop' ).fadeIn();
        } else {
            $( '.scrollToTop' ).fadeOut();
        }
    } );

    //Click event to scroll to top
    $( '.scrollToTop' ).click( function () {
        $( 'html, body' ).animate( {scrollTop: 0}, 800 );
        return false;
    } );

} );

/* detect touch 
----------------------------------------------*/
if ("ontouchstart" in window) {
    document.documentElement.className = document.documentElement.className + " touch";
}
if (!$( "html" ).hasClass( "touch" )) {
    /* background fix */
    $( ".parallax" ).css( "background-attachment", "fixed" );
}

/* fix vertical when not overflow
call fullscreenFix() if .fullscreen content changes */
function fullscreenFix() {
    let h = $( 'body' ).height();
    // set .fullscreen height
    $( ".content-b" ).each( function (i) {
        if ($( this ).innerHeight() <= h) {
            $( this ).closest( ".fullscreen" ).addClass( "not-overflow" );
        }
    } );
}

$( window ).resize( fullscreenFix );
fullscreenFix();

/* resize background images 
----------------------------------------------*/
function backgroundResize() {
    let windowH = $( window ).height();
    $( ".landing, .action, .contact, .subscribe" ).each( function (i) {
        let path = $( this );
        // letiables
        let contW = path.width();
        let contH = path.height();
        let imgW = path.attr( "data-img-width" );
        let imgH = path.attr( "data-img-height" );
        let ratio = imgW / imgH;
        // overflowing difference
        let diff = parseFloat( path.attr( "data-diff" ) );
        diff = diff ? diff : 0;
        // remaining height to have fullscreen image only on parallax
        let remainingH = 0;
        if (path.hasClass( "parallax" ) && !$( "html" ).hasClass( "touch" )) {
            let maxH = contH > windowH ? contH : windowH;
            remainingH = windowH - contH;
        }
        // set img values depending on cont
        imgH = contH + remainingH + diff;
        imgW = imgH * ratio;
        // fix when too large
        if (contW > imgW) {
            imgW = contW;
            imgH = imgW / ratio;
        }
        //
        path.data( "resized-imgW", imgW );
        path.data( "resized-imgH", imgH );
        path.css( "background-size", imgW + "px " + imgH + "px" );
    } );
}

$( window ).resize( backgroundResize );
$( window ).focus( backgroundResize );
backgroundResize();

/* set parallax background-position 
----------------------------------------------*/
function parallaxPosition(e) {
    let heightWindow = $( window ).height();
    let topWindow = $( window ).scrollTop();
    let bottomWindow = topWindow + heightWindow;
    let currentWindow = (topWindow + bottomWindow) / 2;
    $( ".parallax" ).each( function (i) {
        let path = $( this );
        let height = path.height();
        let top = path.offset().top;
        let bottom = top + height;
        // only when in range
        if (bottomWindow > top && topWindow < bottom) {
            let imgW = path.data( "resized-imgW" );
            let imgH = path.data( "resized-imgH" );
            // min when image touch top of window
            let min = 0;
            // max when image touch bottom of window
            let max = -imgH + heightWindow;
            // overflow changes parallax
            let overflowH = height < heightWindow ? imgH - height : imgH - heightWindow; // fix height on overflow
            top = top - overflowH;
            bottom = bottom + overflowH;
            // value with linear interpolation
            let value = min + (max - min) * (currentWindow - top) / (bottom - top);
            // set background-position
            let orizontalPosition = path.attr( "data-oriz-pos" );
            orizontalPosition = orizontalPosition ? orizontalPosition : "50%";
            $( this ).css( "background-position", orizontalPosition + " " + value + "px" );
        }
    } );
}

if (!$( "html" ).hasClass( "touch" )) {
    $( window ).resize( parallaxPosition );
    //$(window).focus(parallaxPosition);
    $( window ).scroll( parallaxPosition );
    parallaxPosition();
}

document.getElementById( "gewinner-link" ).addEventListener( "click", function (event) {
    event.preventDefault(); // Verhindert das Springen der Seite

    const trophyImage = document.getElementById( "trophy-image" );

    // Bild anzeigen und Animation starten
    trophyImage.style.display = "block";
    trophyImage.style.opacity = "1";
    trophyImage.style.animation = "rotate 1s ease-in-out";

    // Bild nach der Animation wieder ausblenden
    setTimeout( function () {
        trophyImage.style.opacity = "0";
        setTimeout( function () {
            trophyImage.style.display = "none";
        }, 300 ); // Zeit, um die Opazität wieder auf 0 zu setzen
    }, 1000 ); // Zeit für die Animation
} );

// Impressum öffnen
document.getElementById( 'openImpressum' ).addEventListener( 'click', function () {
    document.getElementById( 'impressumContainer' ).style.display = 'block';
} );

// Impressum schließen
document.getElementById( 'closeImpressum' ).addEventListener( 'click', function () {
    document.getElementById( 'impressumContainer' ).style.display = 'none';
} );

// Schließen des Impressums, wenn man außerhalb des Containers klickt
window.onclick = function (event) {
    const modal = document.getElementById( 'impressumContainer' );
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};
// Kategorie-Button Klick-Event
const categoryBtn = document.querySelector( '.dropbtn' );
const dropdownLinks = document.querySelectorAll( '.dropdown-content a' );
const submitBtn = document.getElementById( 'submit-btn' );
let selectedCategory = '';
const clipUrlInput = document.getElementById( 'clip-url' );

// Kategorie-Auswahl
dropdownLinks.forEach( link => {
    link.addEventListener( 'click', function (event) {
        event.preventDefault();
        selectedCategory = this.getAttribute( 'data-category' );
        categoryBtn.textContent = `${selectedCategory}`;

        // Absenden-Button aktivieren
        submitBtn.classList.remove( 'disabled' );
    } );
} );

// // Absenden-Button
// submitBtn.addEventListener('click', function() {
//     if (selectedCategory) {
//         if (selectedCategory && clipUrlInput.value) {
//             alert(`Clip in Kategorie: ${selectedCategory} eingesendet!`);
//            
//             // Zurücksetzen des Buttons und Textfelds nach erfolgreichem Absenden
//             categoryBtn.textContent = 'Kategorie wählen';
//             submitBtn.classList.add('disabled');
//             clipUrlInput.value = ''; // Textfeld zurücksetzen
//             selectedCategory = ''; // Kategorie zurücksetzen
//         } else {
//             alert('Bitte einen Clip-Link einfügen.');
//         }
//     } else {
//         alert('Bitte eine Kategorie auswählen.');
//     }
// });
