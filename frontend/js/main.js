// Globale Variablen
let teamMembers = []; // Hier werden später die Bilder gespeichert
let remainingImages = []; // Kopie der Bilder zum zufälligen Anzeigen

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor( Math.random() * (i + 1) );
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// CSS adjustments for fade-out effect
const style = document.createElement( 'style' );
style.innerHTML = `
    .animated-image {
    opacity: 1;
    transition: opacity 2s ease;
}
    .fade-out {
    opacity: 0;
}
    `;
document.head.appendChild( style );


// Global namespace for functions called from HTML
window.ClipAwards = {
    startVoting: () => {
        ClipAwards.voting.start();
    },

    nextCategory: () => {
        ClipAwards.voting.handleNextCategory();
    },

    prevCategory: () => {
        ClipAwards.voting.handlePrevCategory();
    },

    submitVote: () => {
        ClipAwards.voting.submitVote();
    }
};

function fetchClipMetadata(clipId, $element, callback) {
    $.ajax( {
        url: `/api/clip-metadata/${clipId}`, method: 'GET', success: (response) => {
            if (response.success && response.clipMetadata) {
                const metadata = response.clipMetadata;

                // Update title and streamer name in the element
                $element.find( '.clip-title' ).text( metadata.title );
                $element.find( '.streamer-name' ).text( metadata.streamerName );

                // Set profile image if it's part of $element
                const $profileImg = $element.find( '.clip-item' );
                if ($profileImg.length > 0) {
                    $profileImg.attr( 'style', `
    background-image: 
        linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.9)), 
        url('${metadata.profileImageUrl}');
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
` );
                    $profileImg.attr( 'alt', `${metadata.streamerName} Profile` );
                    $profileImg.show();
                }

                // Call the callback with metadata if provided
                if (callback) {
                    callback( metadata );
                }
            } else {
                console.error( 'Failed to load metadata for clip:', clipId );
                $element.find( '.clip-title' ).text( 'Fehler beim Laden' );
                $element.find( '.streamer-name' ).text( 'Unbekannter Streamer' );
            }
        }, error: (error) => {
            console.error( 'Error fetching clip metadata:', error );
            $element.find( '.clip-title' ).text( 'Fehler beim Laden' );
            $element.find( '.streamer-name' ).text( 'Unbekannter Streamer' );
        }
    } );
}

function displayRandomImage() {
    const animatedContainer = document.querySelector( '.animated-image-container' );

    // Check, ob Bilder verfügbar sind
    if (!remainingImages || remainingImages.length === 0) {
        console.warn( "No remaining images. Refilling the image pool." );
        remainingImages = [...teamMembers]; // Auffüllen
        shuffle( remainingImages ); // Erneut mischen
    }

    // Nächstes Bild holen
    const nextImage = remainingImages.pop();

    // Null-Check für nextImage
    if (!nextImage || !nextImage.src) {
        console.error( "Invalid image object detected." );
        return;
    }

    const imgElement = document.createElement( 'img' );
    imgElement.src = nextImage.src;
    imgElement.alt = "Random team member";
    imgElement.classList.add( 'animated-image' );

    // Positioniere das Bild zufällig innerhalb des Containers
    imgElement.style.top = `${Math.random() * 80}%`;
    imgElement.style.left = `${Math.random() * 80}%`;

    animatedContainer.appendChild( imgElement );

    // Bild nach 11 Sekunden ausblenden und entfernen
    setTimeout( () => {
        imgElement.classList.add( 'fade-out' );
        setTimeout( () => imgElement.remove(), 2000 ); // 2s für Fade-Out
    }, 11000 ); // Nach 11s starten, insgesamt 13s sichtbar

    // Nach 2 Sekunden das nächste Bild anzeigen
    setTimeout( displayRandomImage, 2000 );
}

// Main application
const ClipAwards = {
    config: {
        dates: {
            votingEnd: new Date( "Dec 24, 2024 20:00:00" ).getTime()
        }, apiEndpoints: {
            auth: '/auth/twitch', userInfo: '/api/user', categories: '/api/prize-categories', categoriesAndClips: '/api/categories-clips', submitVote: '/api/vote-clips'
        }, selectors: {
            navigation: '#navbar-scroll',
            countdownSection: '#countdown-section',
            votingContainer: '#voting-container',
            votingSummary: '#voting-summary',
            clipsList: '#clips-container',
            categoryTitle: '#voting-category-title',
            selectedClip: '#selected-clip-container',
            navigationButtons: '.navigation-buttons',
            timer: '#timer',
            thankYouMessage: '#thank-you-message'
        }
    },

    state: {
        currentPhase: 'voting', selectedClips: {}, currentCategoryIndex: 0, categories: [], isLoggedIn: false, hasVoted: false, isLoadingCategories: false
    },

    init() {
        $( document ).ready( () => {
            console.log( 'Initializing Clip Awards...' );
            $( '#team-section' ).load( './components/team.html', function (response, status, xhr) {
                if (status === "error") {
                    console.error( "Error loading team.html: ", xhr.status, xhr.statusText );
                    $( '#team-section' ).text( "Unable to load team content." );
                }
            } );
            this.setupComponents();
            this.bindEvents();
            this.auth.checkLoginStatus();
            this.phases.checkCurrentPhase();
            this.setupAnalytics();
            this.voting.init();
        } )
    },

    setupComponents() {
        this.navigation.init();
        this.countdown.init();
        this.modals.init();
        this.confetti.init();

        new WOW().init();
    },

    bindEvents() {
        $( '#start-voting-btn' ).on( 'click', () => {
            console.log( 'Start voting clicked' );
            this.voting.start();
        } );

        $( '#prev-category-btn' ).on( 'click', () => {
            ClipAwards.voting.handlePrevCategory();
        } );
        $( '#next-category-btn' ).on( 'click', () => {
            ClipAwards.voting.handleNextCategory();
        } );
        $( '#submit-vote-btn' ).on( 'click', () => {
            ClipAwards.voting.submitVote();
        } );

        // Global event handlers
        $( '.scrollToTop' ).on( 'click', (e) => {
            e.preventDefault();
            $( 'html, body' ).animate( {scrollTop: 0}, 800 );
        } );

        // Handle mobile menu
        $( '.navbar-toggle' ).on( 'click', function () {
            $( '.navbar-themers' ).toggleClass( 'in' );
        } );
    },

    auth: {
        checkLoginStatus() {
            $.ajax( {
                url: ClipAwards.config.apiEndpoints.userInfo, method: 'GET', success: (data) => this.handleAuthResponse( data ), error: () => {
                    console.error( 'Auth check failed' );
                    this.handleAuthResponse( {user: null} );
                }
            } );
        },

        handleAuthResponse(data) {
            const elements = {
                userInfo: $( '#user-info' ), loginButton: $( '#openLoginPopup' ), username: $( '#username' ), votingSection: $( '.start-voting-btn' )
            };

            if (data.user) {
                elements.userInfo.show();
                elements.loginButton.hide();
                elements.votingSection.removeClass( 'blurred' );
                elements.username.text( data.user.username );
                ClipAwards.state.isLoggedIn = true;

                // New: Check if user has already voted
                this.checkVotingStatus();
            } else {
                elements.votingSection.addClass( 'blurred' );
                elements.userInfo.hide();
                elements.loginButton.show();
                ClipAwards.state.isLoggedIn = false;
            }
        },

        // New: Check if user has already voted
        checkVotingStatus() {
            $.ajax( {
                url: '/api/has-voted', method: 'GET', success: (response) => {
                    if (response.success && response.hasVoted) {

                        ClipAwards.state.hasVoted = true;
                        $( '#voting-summary' ).hide();
                        $( '#start-voting-btn' ).hide();
                        $( '#vote-title' ).empty().html( "Dein Vote ist da! 🎉" );
                        $( ClipAwards.config.selectors.thankYouMessage ).show();
                        ClipAwards.confetti.triggerConfetti( 'large' );
                    } else {
                        ClipAwards.state.hasVoted = false;
                    }
                }, error: (error) => {
                    console.error( 'Error checking voting status:', error );
                }
            } );
        }
    },

    navigation: {
        init() {
            this.setupNavigation();
            this.setupScrollBehavior();
        },

        setupNavigation() {
            $( 'a[href^="#"]' ).on( 'click', function (event) {
                event.preventDefault();
                const target = $( this.getAttribute( 'href' ) );
                if (target.length) {
                    $( 'html, body' ).animate( {
                        scrollTop: target.offset().top - 80
                    }, 1000 );
                }
            } );
        },

        setupScrollBehavior() {
            $( window ).on( 'scroll', () => {
                const scrollPos = $( window ).scrollTop();
                $( '.scrollToTop' ).toggleClass( 'visible', scrollPos > 300 );
                this.updateActiveNavItem( scrollPos );
            } );
        },

        updateActiveNavItem(scrollPos) {
            $( 'section' ).each( function () {
                const sectionTop = $( this ).offset().top - 100;
                const sectionBottom = sectionTop + $( this ).height();
                const navItem = $( `a[href="#${$( this ).attr( 'id' )}"]` );

                if (scrollPos >= sectionTop && scrollPos < sectionBottom) {
                    navItem.addClass( 'active' );
                } else {
                    navItem.removeClass( 'active' );
                }
            } );
        }
    },

    countdown: {
        init() {
            this.startCountdown();
        },

        startCountdown() {
            const updateTimer = () => {
                const now = new Date().getTime();
                const timeLeft = ClipAwards.config.dates.votingEnd - now;

                if (timeLeft < 0) {
                    $( ClipAwards.config.selectors.timer )
                        .text( "Es geht in wenigen Momenten weiter" );
                    return;
                }

                const time = this.calculateTimeRemaining( timeLeft );
                this.updateDisplay( time );
            };

            updateTimer();
            setInterval( updateTimer, 1000 );
        },

        calculateTimeRemaining(timeLeft) {
            return {
                days: Math.floor( timeLeft / (1000 * 60 * 60 * 24) ),
                hours: Math.floor( (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60) ),
                minutes: Math.floor( (timeLeft % (1000 * 60 * 60)) / (1000 * 60) ),
                seconds: Math.floor( (timeLeft % (1000 * 60)) / 1000 )
            };
        },

        updateDisplay(time) {
            $( '#days' ).text( time.days );
            $( '#hours' ).text( time.hours );
            $( '#minutes' ).text( time.minutes );
            $( '#seconds' ).text( time.seconds );
        }
    },

    modals: {
        init() {
            this.setupImpressum();
            this.setupLoginModal();
        },

        setupImpressum() {
            const $impressum = $( '#impressumContainer' );

            $( '#openImpressum' ).on( 'click', () => $impressum.fadeIn() );
            $( '#closeImpressum' ).on( 'click', () => $impressum.fadeOut() );

            $( window ).on( 'click', (event) => {
                if ($( event.target ).is( '#impressumContainer' )) {
                    $impressum.fadeOut();
                }
            } );
        },

        setupLoginModal() {
            const $loginPopup = $( '#loginPopup' );

            $( '#openLoginPopup' ).on( 'click', () => $loginPopup.show() );
            $( '#closeLogin' ).on( 'click', () => $loginPopup.hide() );

            $( window ).on( 'click', (event) => {
                if (event.target === $loginPopup[0]) {
                    $loginPopup.hide();
                }
            } );
        }
    },

    voting: {
        init() {
            console.log( 'Initializing voting system...' );
            this.bindNavigationEvents();
            this.fetchCategories();
        },


        start() {
            console.log( 'Starting voting process...' );

            // Check if user is logged in
            if (!ClipAwards.state.isLoggedIn) {
                console.log( 'User not logged in, showing login popup' );
                $( '#openLoginPopup' ).click();
                return;
            }

            // Check if categories are still loading
            if (ClipAwards.state.isLoadingCategories) {
                console.log( 'Categories still loading, waiting...' );
                return;
            }

            // Check if categories are loaded, if not fetch them
            if (!ClipAwards.state.categories || ClipAwards.state.categories.length === 0) {
                console.log( 'No categories loaded, fetching...' );
                this.fetchCategories( () => this.showVotingInterface() );
                return;
            }

            // If user has already voted, show thank you message and trigger confetti
            if (ClipAwards.state.hasVoted) {
                $( '#voting-summary' ).hide();
                $( ClipAwards.config.selectors.thankYouMessage ).show();
                ClipAwards.confetti.triggerConfetti( 'large' );
                return;
            }

            // Show voting interface if no conditions above were met
            this.showVotingInterface();
        },

        showVotingInterface() {
            console.log( 'Showing voting interface' );
            $( ClipAwards.config.selectors.countdownSection ).hide();
            $( ClipAwards.config.selectors.votingContainer ).show();
            this.loadCurrentCategory();
        },

        fetchCategories(callback) {
            if (ClipAwards.state.isLoadingCategories) {
                console.log( 'Already loading categories...' );
                return;
            }

            ClipAwards.state.isLoadingCategories = true;
            console.log( 'Fetching categories...' );

            $.ajax( {
                url: ClipAwards.config.apiEndpoints.categoriesAndClips, method: 'GET', success: (response) => {
                    ClipAwards.state.isLoadingCategories = false;
                    if (response.success) {
                        console.log( 'Received categories:', response.categories );

                        // Ensure we have all categories
                        ClipAwards.state.categories = response.categories;

                        // Debug log each category
                        ClipAwards.state.categories.forEach( category => {
                            console.log( `Category: ${category.name} (ID: ${category.id})` );
                            console.log( `Number of clips: ${category.clips ? category.clips.length : 0}` );
                        } );

                        if (callback) callback();
                    } else {
                        console.error( 'Failed to fetch categories:', response.message );
                    }
                }, error: (error) => {
                    ClipAwards.state.isLoadingCategories = false;
                    console.error( 'Error fetching categories:', error );
                }
            } );
        }, clearSelectedClipDisplay() {
            const $selectedClip = $( ClipAwards.config.selectors.selectedClip );
            $selectedClip.html( `
        <div class="placeholder-container">
            <p class="placeholder-text">Bitte wähle einen Clip aus.</p>
        </div>
    ` );
        },

        loadCurrentCategory() {
            // Clear the previously selected clip display
            this.clearSelectedClipDisplay();

            const category = ClipAwards.state.categories[ClipAwards.state.currentCategoryIndex];
            console.log( 'Loading category:', category );
            console.log( 'Current category index:', ClipAwards.state.currentCategoryIndex );
            console.log( 'Total categories:', ClipAwards.state.categories.length );

            if (!category) {
                console.error( 'No category found for index:', ClipAwards.state.currentCategoryIndex );
                return;
            }

            this.updateCategoryDisplay( category );
            this.renderClips( category.clips || [] );
            this.updateNavigationButtons();
        },

        updateCategoryDisplay(category) {
            $( ClipAwards.config.selectors.categoryTitle ).html( `
                <span class="category-label">KATEGORIE:</span> 
                <span id="category-name">${category.name}</span>
            ` );
        }, renderClips(clips) {
            console.log( `Rendering ${clips.length} clips for current category` );
            const $container = $( ClipAwards.config.selectors.clipsList ).empty();

            if (!clips || clips.length === 0) {
                $container.html( `
            <div class="no-clips-message">
                <p>Keine Clips für diese Kategorie verfügbar.</p>
            </div>
        ` );
                return;
            }

            clips.forEach( clip => {
                this.createClipElement( clip, $container );
            } );

            this.enableClipSelection();
        },

        // createClipElement(clip, $container) {
        //     // Initial clip element structure with placeholders
        //     const $clipElement = $(`
        //                             <div class="clip-item" role="button" tabindex="0" style="cursor: pointer;">
        //                                 <div class="clip-info">
        //                                     <img src="" alt="Streamer Profile" class="streamer-profile" style="display: none;" />
        //                                     <div class="clip-details">
        //                                         <h3 class="clip-title" title="Lade Titel...">Lade Titel...</h3>
        //                                         <p class="streamer-name">Lade Streamer...</p>
        //                                     </div>
        //                                 </div>
        //                                 <div class="clip-selection">
        //                                     <h2 class="selection-text">Klicke, um diesen Clip zu wählen!</h2>
        //                                     <div class="select-circle" onclick="selectClip('${clip.clipId}', this)">
        //                                         <span class="cross">✕</span>
        //                                     </div>
        //                                 </div>
        //                             </div>
        //                         `);
        //
        //     $container.append($clipElement);
        //
        //     // Fetch metadata for each clip
        //     $.ajax({
        //         url: `/api/clip-metadata/${clip.clipId}`,
        //         method: 'GET',
        //         success: (response) => {
        //             if (response.success && response.clipMetadata) {
        //                 const metadata = response.clipMetadata;
        //
        //                 // Update clip title and streamer name
        //                 $clipElement.find('.clip-title').text(metadata.title).attr('title', metadata.title);
        //                 $clipElement.find('.streamer-name').text(metadata.streamerName);
        //
        //                 // Set profile image and make it visible
        //                 const $profileImg = $clipElement.find('.streamer-profile');
        //                 $profileImg.attr('src', metadata.profileImageUrl);
        //                 $profileImg.attr('alt', `${metadata.streamerName} Profile`);
        //                 $profileImg.show();
        //             } else {
        //                 console.error('Failed to load metadata for clip:', clip.clipId);
        //             }
        //         },
        //         error: (error) => {
        //             console.error('Error fetching clip metadata:', error);
        //             $clipElement.find('.clip-title').text('Fehler beim Laden');
        //             $clipElement.find('.streamer-name').text('Unbekannter Streamer');
        //         }
        //     });
        // },

        createClipElement(clip, $container) {
            // Placeholder element with an image tag for profile picture
            const $clipElement = $( `
        <div class="clip-image">
        <div class="clip-item" data-clip-id="${clip.clipId}">
            
            <div class="clip-info">
                    <img alt="Streamer Profile" class="streamer-profile" src="" style="display: none;" />
                <div class="clip-details">
                    <p class="streamer-name">Lade Streamer...</p>
                    <h3 class="clip-title">Lade Titel...</h3>
                </div>
            </div>
            <div class="clip-selection">
                <h2 class="selection-text">Klicke, um diesen Clip zu wählen!</h2>
                <div class="select-circle">
                    <span class="cross">&#10005;</span>
                </div>
            </div>
            </div>
        </div>
    ` );

            $container.append( $clipElement );

            // Fetch clip metadata from the server
            $.ajax( {
                url: `/api/clip-metadata/${clip.clipId}`, method: 'GET', success: (response) => {
                    if (response.success && response.clipMetadata) {
                        const metadata = response.clipMetadata;
                        $clipElement.find( '.clip-title' ).text( metadata.title );
                        $clipElement.find( '.streamer-name' ).text( metadata.streamerName );

                        // Set profile image and make it visible
                        const $profileImg = $clipElement.find( '.clip-item' );
                        $profileImg.attr( 'style', `
    background-image: 
        linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.95)), 
        url('${metadata.profileImageUrl}');
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
` );
                        $profileImg.attr( 'alt', `${metadata.streamerName} Profile` );
                        $profileImg.show();
                    } else {
                        console.error( 'Failed to load metadata for clip:', clip.clipId );
                    }
                }, error: (error) => {
                    console.error( 'Error fetching clip metadata:', error );
                    $clipElement.find( '.clip-title' ).text( 'Fehler beim Laden' );
                    $clipElement.find( '.streamer-name' ).text( 'Unbekannter Streamer' );
                }
            } );
        }, enableClipSelection() {
            $( '.clip-item' ).off( 'click' ).on( 'click', function () {
                const clipId = $( this ).data( 'clip-id' );
                const categoryClips = ClipAwards.state.categories[ClipAwards.state.currentCategoryIndex].clips;
                const clip = categoryClips.find( c => c.clipId === clipId );

                if (clip) {
                    ClipAwards.voting.handleClipSelection( clip, this );
                }
            } );
        },

        handleClipSelection(clip, element) {
            this.updateSelectedClipDisplay( clip );
            this.updateSelectionState( clip.clipId );
            ClipAwards.state.selectedClips[ClipAwards.state.currentCategoryIndex] = clip.clipId;
            this.enableNextButton();
        },

        updateSelectedClipDisplay(clip) {
            const $selectedClip = $( ClipAwards.config.selectors.selectedClip );

            // Show loading placeholder while fetching metadata
            $selectedClip.html( `
        <div class="clip-info">
            <div class="clip-details">
                <p class="streamer-name">Loading streamer...</p>
                <h3 class="clip-title">Loading title...</h3>
            </div>
        </div>
        <div class="iframe-container">
            <p>Loading clip...</p>
        </div>
    ` ).show();

            // Check if metadata is already available
            if (!clip.title || !clip.streamerName) {
                // Fetch metadata if not available, then update the display
                fetchClipMetadata( clip.clipId, $selectedClip, (metadata) => {
                    // Update the clip object with fetched metadata
                    clip.title = metadata.title;
                    clip.streamerName = metadata.streamerName;

                    // Call the function again with updated clip object to replace placeholder
                    this.updateSelectedClipDisplay( clip );
                } );
                return; // Exit to wait for metadata before proceeding with display
            }

            // Extract the clipId from the URL for embedding
            const url = clip.clipTitle; // Ensure this is the actual URL containing the clipId
            const match = url.match( /clip\/([a-zA-Z0-9_-]+)(\?|$)/ );
            const clipId = match ? match[1] : null;

            if (!clipId) {
                console.error( "Clip ID could not be extracted from URL:", url );
                return;
            }

            // Set the hostname for embedding
            const hostname = window.location.hostname;

            // Update `selected-clip-container` with fetched title and streamer name
            $selectedClip.html( `
        <div class="clip-info">
            <div class="clip-details">
                <p class="streamer-name">${clip.streamerName}</p>
                <h3 class="clip-title">${clip.title}</h3> <!-- Use fetched title here -->
            </div>
        </div>
        <div class="iframe-container">
            <iframe 
                src="https://clips.twitch.tv/embed?clip=${clipId}&parent=${hostname}&muted=false" 
               allowfullscreen>
            </iframe>
        </div>
    ` ).show().get( 0 ).scrollIntoView( {behavior: "smooth", block: "center"} );
        },

        updateSelectionState(clipId) {
            $( '.clip-item' ).addClass( 'disabled' )
                .find( '.select-circle' ).removeClass( 'selected' );

            $( `.clip-item[data-clip-id="${clipId}"]` )
                .removeClass( 'disabled' )
                .find( '.select-circle' )
                .addClass( 'selected' );
        },

        handleNextCategory() {
            if (ClipAwards.state.currentCategoryIndex === ClipAwards.state.categories.length - 1) {
                this.showSummary();
            } else {
                ClipAwards.state.currentCategoryIndex++;
                this.loadCurrentCategory();
            }
        },

        handlePrevCategory() {
            if (ClipAwards.state.currentCategoryIndex > 0) {
                ClipAwards.state.currentCategoryIndex--;
                this.loadCurrentCategory();
            }
        },

        updateNavigationButtons() {
            const $prevBtn = $( '#prev-category-btn' );
            const $nextBtn = $( '#next-category-btn' );
            const currentIndex = ClipAwards.state.currentCategoryIndex;
            const categories = ClipAwards.state.categories;

            // Show or hide the previous button based on the current index
            $prevBtn.toggle( currentIndex > 0 );

            // Determine if we are at the last category
            const isLastCategory = currentIndex === categories.length - 1;

            // Set previous button text if there's a previous category
            if (currentIndex > 0) {
                const prevCategoryName = categories[currentIndex - 1].name;
                $prevBtn.text( ` ◀◀  ${prevCategoryName} ` );
            } else {
                $prevBtn.text( 'Zurück' ); // Default text if no previous category
            }

            // Set next button text to either the next category or "Zusammenfassung" if at the end
            if (isLastCategory) {
                $nextBtn.text( 'Zusammenfassung' );
            } else {
                const nextCategoryName = categories[currentIndex + 1].name;
                $nextBtn.text( ` ${nextCategoryName}  ▶▶ ` );
            }

            // Disable the next button if the current category has no selected clip
            $nextBtn.prop( 'disabled', !ClipAwards.state.selectedClips[currentIndex] );
        },

        enableNextButton() {
            $( '#next-category-btn' ).prop( 'disabled', false );
        },

        showSummary() {
            const $summary = $( ClipAwards.config.selectors.votingSummary );
            const $list = $( '#chosen-clips-list' ).empty();

            ClipAwards.state.categories.forEach( (category, index) => {
                const clipId = ClipAwards.state.selectedClips[index];
                const clip = category.clips.find( c => c.clipId === clipId );

                if (clip) {
                    const $summaryElement = this.createSummaryElement( category, clip );
                    $list.append( $summaryElement );
                }
            } );

            $( ClipAwards.config.selectors.votingContainer ).hide();
            $summary.show().get( 0 ).scrollIntoView( {behavior: 'smooth'} );
        },

        createSummaryElement(category, clip) {
            const $summaryElement = $( `
        <div class="category-container" role="button" tabindex="0">
            <h3 class="category-title">
                <span class="category-label">KATEGORIE:</span><br>
                ${category.name}
            </h3>
            <div class="clip-info">
                <div class="clip-details">
                    <h4 class="clip-title">Lade Titel...</h4>
                    <p class="streamer-name">Lade Streamer...</p>
                </div>
            </div>
        </div>
    ` );

            // Klick-Event hinzufügen, um das iframe im ausgewählten Clip-Bereich anzuzeigen
            $summaryElement.on( 'click', () => {
                this.updateSelectedClipDisplay( clip );
            } );

            // Clip-Metadaten abrufen und im Element anzeigen
            fetchClipMetadata( clip.clipId, $summaryElement, (metadata) => {
                $summaryElement.find( '.clip-title' ).text( metadata.title );
                $summaryElement.find( '.streamer-name' ).text( metadata.streamerName );


            } );

            return $summaryElement;
        },

        submitVote() {
            // Prepare all votes
            const votes = Object.entries( ClipAwards.state.selectedClips ).map( ([categoryIndex, clipId]) => ({
                clip_submission_id: clipId, prize_category_id: ClipAwards.state.categories[categoryIndex].id
            }) );

            // Check if we have votes for all categories
            if (votes.length !== ClipAwards.state.categories.length) {
                alert( 'Bitte wähle einen Clip für jede Kategorie aus.' );
                return;
            }

            // Submit all votes at once
            $.ajax( {
                url: ClipAwards.config.apiEndpoints.submitVote, method: 'POST', data: JSON.stringify( {votes} ), contentType: 'application/json', success: (response) => {
                    if (response.success) {
                        $( '#voting-summary' ).hide();
                        $( ClipAwards.config.selectors.thankYouMessage ).show();
                        ClipAwards.state.hasVoted = true;
                        ClipAwards.confetti.triggerConfetti( 'large' );
                    } else {
                        alert( 'Fehler beim Abstimmen: ' + response.message );
                    }
                }, error: (error) => {
                    console.error( 'Error submitting votes:', error );
                    if (error.responseJSON && error.responseJSON.message) {
                        alert( 'Fehler: ' + error.responseJSON.message );
                    } else {
                        alert( 'Fehler beim Abstimmen. Bitte versuche es später erneut.' );
                    }
                }
            } );
        },
        bindNavigationEvents() {
            $( '#prev-category-btn' ).on( "click", )
        }
    },

    phases: {
        checkCurrentPhase() {
            const now = new Date().getTime();
            if (now >= ClipAwards.config.dates.votingEnd) {
                this.switchToResultsPhase();
            }
        },

        switchToResultsPhase() {
            ClipAwards.state.currentPhase = 'results';
            $( ClipAwards.config.selectors.countdownSection ).hide();
            $( ClipAwards.config.selectors.votingContainer ).hide();
            $( '#results-container' ).show();
        }
    },

    confetti: {
        init() {
            const $trigger = $( '#confetti-trigger' );
            if ($trigger.length) {
                $trigger.on( 'mouseover', () => this.triggerConfetti( 'small' ) );
                $trigger.on( 'click', () => this.triggerConfetti( 'large' ) );
            }
        },

        triggerConfetti(size = 'small') {
            const options = size === 'small' ? {
                particleCount: 30, spread: 50, origin: {y: 0.6}
            } : {
                particleCount: 100, spread: 70, origin: {y: 0.6}
            };

            confetti( {
                ...options, colors: ['#ffd700', '#ffb347', '#ffa500'], shapes: ['square', 'circle']
            } );
        }
    },

    setupAnalytics() {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () {
            dataLayer.push( arguments );
        };
        gtag( 'js', new Date() );
        gtag( 'config', 'G-G8REJXR93X' );
    }
};

function initializeTeamImages() {
    // Wähle alle Bilder aus der geladenen HTML
    teamMembers = Array.from( document.querySelectorAll( '.team-container .team-member img' ) );

    // Check, ob Bilder gefunden wurden
    if (teamMembers.length === 0) {
        console.error( "No team member images found in team.html!" );
        return;
    }

    // Kopiere die Bilder für die Animation
    remainingImages = [...teamMembers];

    // Mische die Bilder
    shuffle( remainingImages );

    // Starte die Animation
    displayRandomImage();
}

$( document ).ready( () => {
    // Initialize main application
    ClipAwards.init();
    // Lade team.html und initialisiere Bilder
    $( '#team-section' ).load( './components/team.html', function (response, status, xhr) {
        if (status === "error") {
            console.error( "Error loading team.html: ", xhr.status, xhr.statusText );
            $( '#team-section' ).text( "Unable to load team content." );
        } else {
            // Nach dem Laden initialisiere die Bilder
            initializeTeamImages();
        }
    } );
    // Handle window load events
    $( window ).on( 'load', () => {
        $( '.preloader' ).fadeOut( 'slow' );
    } );

    // Handle window resize events
    $( window ).on( 'resize', () => {
        // Add any necessary responsive adjustments
    } );
} );