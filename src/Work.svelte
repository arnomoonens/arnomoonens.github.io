<script>
    import Page from './Page.svelte';
    import image from './images/evcharging.jpeg';
</script>

<Page on:close>
    <h2 class="major">Work</h2>
    <span class="image main"><img src={image} alt="Charging electric vehicle" /></span>
    <p>I work at <a href="https://unipartners.be">UniPartners</a>, where I am a data scientist and machine learning engineer.</p>
    <p>As of programming languages, I use Python most of the time, but I also know my way around SQL, C, C++, Bash, HTML, TypeScript and JavaScript.</p>
    <p>When doing data science or building machine learning applications with Python, I use the following packages or tools:</p>
    <ul>
        <li>PyTorch</li>
        <li>TensorFlow</li>
        <li>NumPy</li>
        <li>Scikit-Learn</li>
        <li>OpenAI Gym</li>
        <li>Numba</li>
        <li>Matplotlib</li>
        <li>Plotly</li>
        <li>Jupyter Notebook</li>
        <li>Streamlit</li>
        <li>Flask</li>
        <li>cvxopt</li>
        <li>Optuna</li>
        <li>requests</li>
        <li>Sphinx</li>
        <li>Beautifulsoup</li>
    </ul>

    <p>You can see me using some of these packages in my public repositories on <a href="https://github.com/arnomoonens">GitHub</a>.</p>
    <p>In terms of databases, I have experience with Microsoft SQL Server, MySQL and PostgreSQL.</p>
    <p>Last, I also have experience with the following tools and services:</p>
    <ul>
        <li>Git</li>
        <li>Amazon Web Services</li>
        <li>Microsoft Office</li>
        <li>Visual Studio Code</li>
        <li>Vim</li>
        <li>Slurm Workload Manager</li>
    </ul>
</Page>
