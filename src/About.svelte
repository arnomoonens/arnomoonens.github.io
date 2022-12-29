<script>
    import Page from './Page.svelte';
    import image from './images/electriclongboard.jpeg';
</script>

<Page on:close>
    <h2 class="major">About</h2>
    <span class="image main"><img src={image} alt="Electric longboard" /></span>
    <p>Welcome to my About page! My name is Arno and I am a data scientist/machine learning engineer by day and a fitness enthusiast, language learner, and FIFA champion by night. </p>
    <p>When I'm not busy crunching numbers and creating algorithms, you can find me hitting the gym or trying to become fluent in Italian (although I'll admit, my "Ciao" still sounds more like a botched attempt at a reverse sneeze). </p>
    <p>But don't let my love for fitness and linguistics fool you, I am also a nerd at heart and can often be found buried in a non-fiction book or tinkering with the latest machine learning techniques (because let's be real, learning about machine learning is just as fun as actually doing it).</p>
    <p>In my spare time, I like to take long walks (because who doesn't love some good cardio?), and challenge my friends to a game of FIFA (where I will inevitably emerge victorious). </p>
    <p>Thanks for stopping by and getting to know me a little better. I hope you have a great day!</p>
</Page>
