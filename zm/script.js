
// Login a user
$('#login_btn').click(async function () {
    const username = $('#username').val();
    const phoneNumber = $('#phoneNumber').val();

    try {
        // Load user details from config.json
        const response = await fetch('config.json');
        const config = await response.json();

        // Find the matching user in config.json
        const user = config.users.find(user =>
            user.username === username && user.phoneNumber === phoneNumber
        );

        if (user) {
            // Store user details in localStorage
            localStorage.setItem('username', user.username);
            localStorage.setItem('phoneNumber', user.phoneNumber);
            localStorage.setItem('pbxDetails', JSON.stringify(user.pbxDetails));

            // Log the user details
            console.log("Login successful!");
            console.log("User details:", {
                username: user.username,
                phoneNumber: user.phoneNumber,
                pbxDetails: user.pbxDetails
            });

            // Redirect to queues.html
            window.location.href = 'index.html';
        } else {
            // Show error message
            alert("Invalid username or phone number");
        }
    } catch (error) {
        console.error("Error loading config.json:", error);
    }
});
// Handle logout
$('#logout_btn').click(function () {
    localStorage.clear();
    Cti.logoutAgent();
    window.location.href = "./signin.html";
});



// index.html
function callDistribution() {
    const timeFrames = createTimeFrames(2);
    let hourlyCallData = initializeHourlyCallData(timeFrames);
    console.log("Requesting queue logs.....")
    fetchData('queue_logs').then(queueLogs => {
        console.log("=================", queueLogs);
        const queueCallCount = {};
        const callsInQueue = {}; // To track calls that entered the queue
        // const queueList = Object.keys(queueCallCount);
        let overallLongestAnsweredCall = 0;
        let callHandlingCount = {
            answered: 0,
            unanswered: 0
        };

        // Initialize queue counts
        const todayAt7AM = new Date();
        todayAt7AM.setHours(7, 0, 0, 0);
        queueLogs.forEach(log => {
            const logTime = new Date(log.time);
            if (logTime > todayAt7AM) {
                const queueName = log.queuename;
                const callId = log.callid;
                const event = log.event;
                const callStartTime = new Date(log.time);
                const callDuration = Number(log.data1);
                // Ensure the queue is tracked
                if (!queueCallCount[queueName]) {
                    console.log("queue call count not initialize for: ", queueName);
                    queueCallCount[queueName] = {
                        totalCalls: 0,
                        answeredCalls: 0,
                        abandonedCalls: 0
                    };
                }
                // Track calls that enter the queue
                if (event === "ENTERQUEUE") {
                    queueCallCount[queueName].totalCalls++;
                    callsInQueue[callId] = queueName; // Store the queue name for this call ID

                    // Assign the call to the appropriate time frame
                    timeFrames.forEach(frame => {
                        if (callStartTime >= frame.start && callStartTime < frame.end) {
                            if (!hourlyCallData[frame.label][queueName]) {
                                hourlyCallData[frame.label][queueName] = 0;
                            }
                            hourlyCallData[frame.label][queueName]++;
                        }
                    });
                }
                // Track answered calls based on the call ID
                if (event === "CONNECT") {
                    if (callsInQueue[callId]) { // Check if this call ID has entered a queue
                        queueCallCount[callsInQueue[callId]].answeredCalls++;
                        callHandlingCount.answered++;
                        delete callsInQueue[callId];
                        // Track the longest answered call overall
                        if (callDuration > overallLongestAnsweredCall) {
                            overallLongestAnsweredCall = callDuration;
                        }
                    }

                }
                // Track abandoned calls
                if (event === "ABANDON") {
                    if (callsInQueue[callId]) {
                        queueCallCount[callsInQueue[callId]].abandonedCalls++;
                        callHandlingCount.unanswered++;
                        delete callsInQueue[callId];
                    }
                }
            }

        });

        // Log the results
        console.log("Queue Call Counts:", queueCallCount);
        // Optionally, update the UI or other elements with the totals
        for (const queue in queueCallCount) {
            console.log(`Queue: ${queue}, Total Calls: ${queueCallCount[queue].totalCalls}, Answered Calls: ${queueCallCount[queue].answeredCalls}, Abandoned Calls: ${queueCallCount[queue].abandonedCalls}`);
        }
        const totalAnsweredCalls = callHandlingCount.answered;
        const enteredCalls = totalAnsweredCalls + callHandlingCount.unanswered;
        const answerRate = enteredCalls > 0 ? (totalAnsweredCalls / enteredCalls) * 100 : 0;

        document.getElementById("answerRate").innerText = answerRate.toFixed() + "%";
        document.getElementById("totalCallsCard").innerText = enteredCalls;
        document.getElementById("totalCalls").innerText = enteredCalls;
        document.getElementById("totalAnswered").innerText = callHandlingCount.answered;
        document.getElementById("totalUnanswered").innerText = callHandlingCount.unanswered;

        const labels = Object.keys(queueCallCount);
        const values = Object.values(queueCallCount).map(queue => queue.totalCalls);

        const queueSelect = document.getElementById("queueSelect");
        queueSelect.innerHTML = "";
        labels.forEach(label => {
            const option = document.createElement("option");
            option.value = label;
            option.textContent = label;
            queueSelect.appendChild(option);
        });

        const totalQueues = labels.length;
        document.getElementById("totalQueues").innerText = totalQueues;

        // Plot the first pie chart with call distribution
        const layout = { title: "Call Distribution" };
        const data = [{
            labels: labels,
            values: values,
            type: "pie"
        }];
        Plotly.newPlot("myPlot", data, layout);
        // Prepare data for the second pie chart (Call Handling)
        const handlingLabels = ["Answered", "Unanswered", "Emitted"];
        const handlingValues = [callHandlingCount.answered, callHandlingCount.unanswered, callHandlingCount.emitted];

        // Plotting the second pie chart
        const layout2 = { title: "Call Handling Distribution" };
        const data2 = [{
            labels: handlingLabels,
            values: handlingValues,
            type: "pie"
        }];
        Plotly.newPlot("myPlot2", data2, layout2);

        console.log("hourly data", hourlyCallData, "default queue", 'apolloincoming', "timeframes", timeFrames.map(frame => frame.label));
        plotLineGraph(hourlyCallData, 'apolloincoming', timeFrames.map(frame => frame.label), 'myLineGraph');

        // Event listener for queue selection change
        document.getElementById("queueSelect").addEventListener("change", function () {
            // const selectedValue = this.value;
            const selectedOption = this.options[this.selectedIndex].text;
            plotLineGraph(hourlyCallData, selectedOption, timeFrames.map(frame => frame.label), 'myLineGraph');
        });

        processAgentStatistics();

    }).catch(error => {
        console.error("Error fetching queue logs: ", error);
    });

}
// Function to process agents stats in index.html
async function processAgentStatistics() {
    const agentInboundTimeframes = createTimeFrames(2);
    let agentInboundHourlyInboundData = initializeHourlyCallData(agentInboundTimeframes);
    const agentOutboundTimeframes = createTimeFrames(2);
    let agentOutboundHourlyInboundData = initializeHourlyCallData(agentOutboundTimeframes);
    try {
        // Fetch all agent statistics
        const { agentStatistics, outboundStatistics, uniqueInboundAgents, longestCallDuration, agentWithLongestCall, uniqueOutboundAgents, longestOutboundCallDuration, agentUtilization } = await fetchAllAgentStatistics();
        // Calculate total outbound calls
        console.log("++++++++++++++++++++++++++++++++++++++++++", agentStatistics);
        console.log("++++++++++++++++++++++++++++++++++++++++++", outboundStatistics);
        let outboundCalls = 0;
        Object.keys(outboundStatistics).forEach(outboundAgentId => {
            outboundCalls += outboundStatistics[outboundAgentId].totalOutboundCalls || 0;
        });

        // Calculate total handle time and aggregate efficiency for inbound agents
        let totalHandleTimeAllAgents = 0;
        let totalInboundEfficiency = 0;
        let totalUtilization = 0;
        const totalInboundAgents = Object.keys(agentStatistics).length;
        Object.keys(agentStatistics).forEach(inboundAgentId => {
            let stats = agentStatistics[inboundAgentId];

            let utilization = stats.utilization;
            if (typeof utilization === 'string') {
                utilization = parseFloat(utilization);
            }

            if (!isNaN(utilization)) {
                totalUtilization += utilization;
            }
            if (stats.totalCalls > 0) {
                // Use pre-calculated handle time and efficiency
                totalHandleTimeAllAgents += parseFloat(stats.averageHandleTime);
                totalInboundEfficiency += parseFloat(stats.efficiency);

                // Loop through the inbound time logs for the agent
                stats.inboundTimeLogs.forEach(logDate => {
                    const callStartTime = new Date(logDate);
                    // Increment the hourly call data for the agent
                    agentInboundTimeframes.forEach(timeframe => {
                        if (callStartTime >= timeframe.start && callStartTime < timeframe.end) {
                            if (!agentInboundHourlyInboundData[timeframe.label][inboundAgentId]) {
                                agentInboundHourlyInboundData[timeframe.label][inboundAgentId] = 0;
                            }
                            agentInboundHourlyInboundData[timeframe.label][inboundAgentId]++;
                        }
                    });
                });
            }
        });

        // Calculate and display the overall average agent utilization
        if (uniqueInboundAgents > 0) {
            const averageUtilization = totalUtilization / uniqueInboundAgents;
            console.log(`Average Agent Utilization: ${averageUtilization.toFixed(2)}%`);
            // You can display this value in the UI, for example:
            document.querySelector("#inboundAgentUtilization").textContent = averageUtilization.toFixed(1) + "%";
        }


        // Calculate overall average efficiency and handle time for inbound agents
        const inboundAverageEfficiency = totalInboundAgents > 0 ? (totalInboundEfficiency / totalInboundAgents).toFixed(2) : '0.00';
        const overallAverageHandleTime = totalInboundAgents > 0 ? formatDuration(totalHandleTimeAllAgents / totalInboundAgents) : '00:00:00';

        // Calculate total handle time and aggregate efficiency for outbound agents
        let totalHandleTimeAllOutboundAgents = 0;
        let totalOutboundEfficiency = 0;
        let totalOutboundUtilization = 0;
        const totalOutboundAgents = Object.keys(outboundStatistics).length;
        Object.keys(outboundStatistics).forEach(outboundAgentUsername => {
            const outboundStats = outboundStatistics[outboundAgentUsername];

            let outboundUtilization = outboundStats.outboundUtilization;
            if (typeof outboundUtilization === 'string') {
                console.log("tiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii")
                outboundUtilization = parseFloat(outboundUtilization);
            }
            if (!isNaN(outboundUtilization)) {
                totalOutboundUtilization += outboundUtilization;
            }
            if (outboundStats.totalOutboundCalls > 0) {
                totalHandleTimeAllOutboundAgents += parseFloat(outboundStats.averageOutboundHandleTime);
                totalOutboundEfficiency += parseFloat(outboundStats.outboundEfficiency);
                // Loop through the outbound time logs for the agent
                outboundStats.outboundTimeLogs.forEach(logDate => {
                    // Parse the call start time
                    const callStartTime = new Date(logDate);
                    // Increment the hourly call data for the agent
                    agentOutboundTimeframes.forEach(timeframe => {
                        if (callStartTime >= timeframe.start && callStartTime < timeframe.end) {
                            if (!agentOutboundHourlyInboundData[timeframe.label][outboundAgentUsername]) {
                                agentOutboundHourlyInboundData[timeframe.label][outboundAgentUsername] = 0;
                            }
                            agentOutboundHourlyInboundData[timeframe.label][outboundAgentUsername]++;
                        }
                    });
                });
            }
        });

        // Calculate and display the overall average agent utilization
        if (uniqueOutboundAgents > 0) {
            const averageOutboundUtilization = totalOutboundUtilization / uniqueOutboundAgents;
            console.log(`Average OUTBOUND Agent Utilization: ${averageOutboundUtilization.toFixed(2)}%`);
            // You can display this value in the UI, for example:
            console.log("LET ME UPDATE!")
            document.querySelector("#outboundAgentUtilization").textContent = averageOutboundUtilization.toFixed(1) + "%";
        }



        // Calculate overall average efficiency for outbound agents
        const outboundAverageEfficiency = totalOutboundAgents > 0 ? (totalOutboundEfficiency / totalOutboundAgents).toFixed(2) : '0.00';
        console.log("-------------------------------------- the first is agent with longest call", agentWithLongestCall, totalOutboundAgents, totalHandleTimeAllOutboundAgents)
        const overallOutboundAverageHandleTime = totalOutboundAgents > 0 ? formatDuration(totalHandleTimeAllOutboundAgents / totalOutboundAgents) : '00:00:00';

        // Update DOM Inbound Stats
        document.getElementById("inboundAgentEfficiency").innerText = inboundAverageEfficiency + "%";
        document.getElementById("inboundAverageHandleTime").innerText = overallAverageHandleTime;
        // document.getElementById("inboundAgentUtilization").innerText = agentUtilization;
        document.getElementById("longestQueueCall").innerText = formatDuration(longestCallDuration);
        document.getElementById("inboundAgentCountDisplay").innerText = totalInboundAgents;

        // Update DOM for outbound agents
        document.getElementById("outboundEfficiency").innerText = outboundAverageEfficiency + "%";
        document.getElementById("outboundAgentsCount").innerText = totalOutboundAgents;
        document.getElementById("totalOutboundCalls").innerText = outboundCalls;
        // document.getElementById("outboundAgentUtilization").innerText = agentUtilization;
        document.getElementById("outboundAvgHandleTime").innerText = overallOutboundAverageHandleTime;
        document.getElementById("outboundLongestCall").innerText = formatDuration(longestOutboundCallDuration);

        // Plot Agent Inbound calls graph
        plotLineGraph(agentInboundHourlyInboundData, "bensonkogi", agentInboundTimeframes.map(timeframe => timeframe.label), 'AgentGraph');
        // Event listener for queue selection change
        document.getElementById("searchButton").addEventListener("click", function () {
            const searchValue = document.getElementById("agentSearch").value;
            plotLineGraph(agentInboundHourlyInboundData, searchValue, agentInboundTimeframes.map(timeframe => timeframe.label), 'AgentGraph');
        });

        // Plot Agent Inbound calls graph
        plotLineGraph(agentOutboundHourlyInboundData, 926, agentOutboundTimeframes.map(timeframe => timeframe.label), 'AgentInboundGraph');
        // Event listener for queue selection change
        document.getElementById("InboundsearchButton").addEventListener("click", function () {
            const searchValue1 = document.getElementById("agentInboundSearch").value;
            plotLineGraph(agentOutboundHourlyInboundData, searchValue1, agentOutboundTimeframes.map(timeframe => timeframe.label), 'AgentInboundGraph');
        });

    } catch (error) {
        console.error("Error in processAgentStatistics:", error);
        throw error;
    }
}
// index.html


/* Queues page queues.html */

// Define team to queue ID mapping
const teamQueueMapping = {
    users: [27, 18, 31, 29, 71, 27],
    fas: [10, 14, 1, 7, 2],
    apolloincoming: [2, 1, 7]
};
// function to connect to PBXs a user has access to
async function connectToPBX(type, filteredQueues = null) {
    const pbxDetails = JSON.parse(localStorage.getItem('pbxDetails')) || [];
    const username = localStorage.getItem('username');
    const phoneNumber = localStorage.getItem('phoneNumber');
    const dataFromAllPBXs = [];

    for (let { ip, token } of pbxDetails) {
        const wsurl = `wss://${ip}/xuc/api/2.0/cti?token=${token}`;
        console.log(`Initializing WebSocket connection to ${ip} for ${type}`);
        try {
            // Initialize WebSocket and retrieve data
            await Cti.WebSocket.init(wsurl, username, phoneNumber);
            console.log(`WebSocket connection established for ${ip}`);
            // Delay to allow connection setup
            const data = await new Promise(resolve => {
                setTimeout(() => {
                    resolve(getData(type, filteredQueues));
                }, 5000);
            });
            console.log(`Data received from PBX at ${ip} for ${type} -------------:`, data);
            // Collect data from each PBX
            dataFromAllPBXs.push(data);
        } catch (error) {
            console.error(`Failed to connect to PBX at ${ip}:`, error);
        }
    }
    // Merge all PBX data into one array for combined results
    return dataFromAllPBXs.flat();
}
// Merge function to combine multiple data arrays
function mergeData(...dataArrays) {
    return dataArrays.flat();
}
// Event handler to fetch and display queue stats for selected team
async function updateQueueStatsForSelectedTeam(combinedQueues) {
    const selectedTeam = document.querySelector("#teamDropdown").value;
    const queueIds = teamQueueMapping[selectedTeam];
    console.log("Queue IDs for selected team:", queueIds);
    // Filter queues based on the selected team
    const filteredQueues = combinedQueues.filter(queue => queueIds.includes(queue.id));
    console.log("Filtered Queues for Team:", filteredQueues);
    // Fetch Queue Stats for the filtered queues
    const combinedStats = await connectToPBX("QueueStatistics", filteredQueues);
    console.log("Combined Queue Statistics:", combinedStats);
}
// get data pasing the type of data and filtered queues for specific time
function getData(type, filteredQueues) {
    console.log("Fetching data for type:", type);
    return new Promise((resolve, reject) => {
        // Send the request to get the list based on the type
        if (type === "agentList") {
            Cti.getList('agent');
        } else if (type === "queueList") {
            Cti.getList("queue");
        } else if (type === "QueueMemberList") {
            Cti.getList("queuemember");
        } else if (type === "QueueStatistics") {
            Cti.subscribeToQueueStats();
        }

        // Listen for incoming WebSocket messages
        Cti.receive = function (event) {
            const data = JSON.parse(event.data);
            console.log("Received data:", data);
            if (data && data.msgType === 'AgentList' && type === 'agentList') {
                console.log("Resolving with agent list data");
                resolve(data.ctiMessage);
            } else if (data && data.msgType === 'QueueList' && type === 'queueList') {
                console.log("Resolving with queue list data");
                resolve(data.ctiMessage);
            } else if (data && data.msgType === 'QueueMemberList' && type === 'QueueMemberList') {
                console.log("Resolving with queue member list data");
                resolve(data.ctiMessage);
            } else if (data && data.msgType === 'QueueStatistics' && type === 'QueueStatistics') {
                console.log("Resolving with queue stats list data");
                getQueueStats(data.ctiMessage, filteredQueues);
                resolve(data.ctiMessage);
            }
        };

        // Timeout to avoid hanging forever in case the message is never received
        setTimeout(() => {
            reject(new Error("Timeout waiting for response from WebSocket"));
        }, 5000);
    });
}
// fetch queue stats for selected queues
function getQueueStats(combinedStats, filteredQueues) {
    const tbody = document.querySelector("#queueStatsTable tbody");
    // tbody.innerHTML = '';
    const scoreCard = document.querySelector(".percentage");
    let maxWaitingTime = 0;
    let totalAnsweredCalls = 0;
    let totalCallsEntered = 0;
    console.log("Am inside queueStats, now here are my filtered values", filteredQueues);
    // Object to store queueId mapped to array of agentIds
    let queueMembership = {};
    filteredQueues.forEach(queue => {
        if (parseInt(combinedStats.queueId) === parseInt(queue.id)) {
            console.log("--- combined stats...", combinedStats);
            let counters = combinedStats.counters;
            // Update maxWaitingTime if the current LongestWaitTime is greater
            const longestWaitTime = getCounterValue(counters, 'EWT');
            if (longestWaitTime > maxWaitingTime) {
                maxWaitingTime = longestWaitTime;
            }

            // Update answered calls and calls entered for efficiency calculation
            totalAnsweredCalls += getCounterValue(counters, 'TotalNumberCallsAnswered');
            totalCallsEntered += getCounterValue(counters, 'TotalNumberCallsEntered');
            // let existingRow = document.querySelector(`tr[data-queue-id="${combinedStats.queueId}"]`);
            let existingRow = document.querySelector(`tr[data-queue-number="${queue.number}"]`);
            if (existingRow) {
                // Update existing row
                counters.forEach(counter => {
                    let statName = counter.statName;
                    let value = counter.value;
                    switch (statName) {
                        case "EWT":
                            existingRow.querySelector('.ewt').textContent = value || 0;
                            break;
                        case "WaitingCalls":
                            existingRow.querySelector('.waitingCalls').textContent = value || 0;
                            break;
                        case "TalkingAgents":
                            existingRow.querySelector('.talkingAgents').textContent = value || 0;
                            break;
                        case "AvailableAgents":
                            existingRow.querySelector('.available').textContent = value || 0;
                            break;
                        case "LoggedAgents":
                            existingRow.querySelector('.loggedIn').textContent = value || 0;
                            break;
                        case "TotalNumberCallsEntered":
                            existingRow.querySelector('.received').textContent = value || 0;
                            break;
                        case "TotalNumberCallsAbandonned":
                            existingRow.querySelector('.abandoned').textContent = value || 0;
                            break;
                        case "TotalNumberCallsAnswered":
                            existingRow.querySelector('.answered').textContent = value || 0;
                            break;
                        case "PercentageAnsweredTotal":
                            existingRow.querySelector('.percentage').textContent = `${parseFloat(value).toFixed(1)}%` || '0';
                            break;
                        case "LongestWaitTime":
                            existingRow.querySelector('.longestWaitTime').textContent = value || 0;
                            break;
                    }
                });
            } else {
                // Create a new row with all the necessary columns
                const newRow = `
                            <tr data-queue-number="${queue.number}">
                                <td>${combinedStats.queueId}</td>
                                <td>${queue.number}</td>
                                <td>${queue.name || 'N/A'}</td>
                                <td class="waitingCalls">${getCounterValue(counters, 'WaitingCalls') || 0}</td>
                                <td class="talkingAgents">${getCounterValue(counters, 'TalkingAgents') || 0}</td>
                                <td class="available">${getCounterValue(counters, 'AvailableAgents') || 0}</td>
                                <td class="loggedIn">${getCounterValue(counters, 'LoggedAgents') || 0}</td>
                                <td class="ewt">${getCounterValue(counters, 'EWT') || 0}</td>
                                <td class="received">${getCounterValue(counters, 'TotalNumberCallsEntered') || 0}</td>
                                <td class="abandoned">${getCounterValue(counters, 'TotalNumberCallsAbandonned') || 0}</td>
                                <td class="answered">${getCounterValue(counters, 'TotalNumberCallsAnswered') || 0}</td>
                                <td class="longestWaitTime">${getCounterValue(counters, 'LongestWaitTime') || 0}</td>
                                <td class="totalAgents">${queueMembership[combinedStats.queueId] ? queueMembership[combinedStats.queueId].length : 0}</td> 
                            </tr>
                        `;
                tbody.insertAdjacentHTML('beforeend', newRow);
            }
        } else {
            console.log("---skipping----")
        }

    });

    // const efficiency = totalCallsEntered > 0 ? ((totalAnsweredCalls / totalCallsEntered) * 100).toFixed(1) : 0;
    // scoreCard.textContent = `${efficiency}%`;
    // const scoreCardElement = document.querySelector(".LongestWaitTime");
    // scoreCardElement.textContent = `${maxWaitingTime} sec.`;

    // Helper function to extract a counter value by name
    function getCounterValue(counters, statName) {
        let stat = counters.find(counter => counter.statName === statName);
        return stat ? stat.value : 0;
    }

}
// Helper function to extract a counter value by name
function getCounterValue(counters, statName) {
    let stat = counters.find(counter => counter.statName === statName);
    return stat ? stat.value : 0;
}
/* Queues page queues.html */



/* Agents Page - agents.html */

// Update inbound & outbound agents table
async function updateAgentStatisticsTable() {
    const { agentStatistics, outboundStatistics, longestCallDuration, agentWithLongestCall, uniqueOutboundAgents, uniqueInboundAgents, longestOutboundCallDuration } = await fetchAllAgentStatistics();
    console.log("OUTBOUND STATS .............................................", outboundStatistics);
    console.log("IN STATS .............................................", agentStatistics);
    // Clear existing rows in both tables
    document.querySelector("#inboundTable tbody").innerHTML = "";
    document.querySelector("#outboundTable tbody").innerHTML = "";

    // Inbound Stats Table
    let totalUtilization = 0;
    Object.keys(agentStatistics).forEach(username => {
        const inboundStats = agentStatistics[username];
        if (inboundStats) {
            const answerRate = (inboundStats.answeredCalls / inboundStats.totalCalls) * 100 || 0;
            const averageCallLengthSeconds = inboundStats.answeredCalls > 0 ? (inboundStats.totalTalkTime / inboundStats.answeredCalls) : 0;
            const averageCallLengthMinutes = formatDuration(averageCallLengthSeconds);
            let utilization = inboundStats.utilization;
            if (typeof utilization === 'string') {
                utilization = parseFloat(utilization);
                totalUtilization += utilization;
            }
            // if (!isNaN(utilization)) {
            // }
            console.log("+++++++++++++++++++++++++++++++++++++__________________", inboundStats.totalHandleTime, inboundStats.totalTalkTime, inboundStats.answeredCalls)
            const row = `
                    <tr data-agent-username="${username}">
                        <td class="text-start">${username}</td>
                        <td class="received-calls">${inboundStats.totalCalls}</td>
                        <td class="answered-calls">${inboundStats.answeredCalls}</td>
                        <td class="unanswered-calls">${inboundStats.unansweredCalls}</td>
                        <td class="answer-rate">${answerRate.toFixed(1)}%</td>
                        <td class="on-call">${formatDuration(inboundStats.totalTalkTime)}</td>
                        <td class="avg-call-length">${averageCallLengthMinutes}</td>
                        <td class="avg-handle-time">${formatDuration((inboundStats.totalHandleTime / inboundStats.answeredCalls))}</td> 
                        <td class="last-call">${inboundStats.lastCallTime ? new Date(inboundStats.lastCallTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "N/A"}</td>
                        <td class="efficiency">${inboundStats.utilization + "%"}</td>
                        <td class="queues"></td>
                    </tr>
                `;
            document.querySelector("#inboundTable tbody").insertAdjacentHTML('beforeend', row);
        }
    });

    // Calculate and display the overall average agent utilization
    if (uniqueInboundAgents > 0) {
        const averageUtilization = totalUtilization / uniqueInboundAgents;
        console.log(`Average Agent Utilization: ${averageUtilization.toFixed(2)}%`);
        // You can display this value in the UI, for example:
        document.querySelector("#inboundAgentsUtilization").textContent = averageUtilization.toFixed(1) + "%";
    }

    // Outbound Stats Table
    let totalOutboundUtilization = 0;
    Object.keys(outboundStatistics).forEach(username => {
        const outboundStats = outboundStatistics[username];
        let outboundUtilization = outboundStats.outboundUtilization;
        if (typeof outboundUtilization === 'string') {
            outboundUtilization = parseFloat(outboundUtilization);
        }
        if (!isNaN(outboundUtilization)) {
            totalOutboundUtilization += outboundUtilization;
        }
        if (outboundStats) {
            const averageCallLengthSeconds = outboundStats.successfullCalls > 0 ? (outboundStats.totalOutboundTalkTime / outboundStats.successfullCalls) : 0;
            const row = `
                <tr data-agent-username="${username}">
                    <td class="text-start">${username}</td>
                    <td class="total-outbound-calls">${outboundStats.totalOutboundCalls}</td>
                     <td class="total-successful-calls">${outboundStats.successfullCalls}</td>
                    <td class="total-outbound-talk-time">${formatDuration(outboundStats.totalOutboundTalkTime)}</td>
                    <td class="average-outbound-call">${formatDuration(averageCallLengthSeconds)}</td>
                    <td class="avg-outbound-handle-time">${formatDuration((outboundStats.totalOutboundHandleTime / outboundStats.successfullCalls))}</td>
                    <td class="last-outbound-call"> ${outboundStats.lastOutboundCallTime ? new Date(outboundStats.lastOutboundCallTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "N/A"}</td>
                    <td class="outbound-efficiency">${outboundStats.outboundUtilization}</td>
                </tr>
            `;
            document.querySelector("#outboundTable tbody").insertAdjacentHTML('beforeend', row);
        }
    });

    // Calculate and display the overall average agent utilization
    if (uniqueOutboundAgents > 0) {
        const averageOutboundUtilization = totalOutboundUtilization / uniqueOutboundAgents;
        console.log(`Average OUTBOUND Agent Utilization: ${averageOutboundUtilization.toFixed(2)}%`);
        // You can display this value in the UI, for example:
        console.log("LET ME UPDATE! i made longest call", agentWithLongestCall);
        document.querySelector("#totalOutboundAgents").textContent = averageOutboundUtilization.toFixed(1) + "%";
    }

    let totalOutboundCalls = 0;
    let totalOutboundSuccessfulCalls = 0;
    Object.keys(outboundStatistics).forEach(outboundAgentId => {
        totalOutboundCalls += outboundStatistics[outboundAgentId].totalOutboundCalls || 0;
        totalOutboundSuccessfulCalls += outboundStatistics[outboundAgentId].successfullCalls || 0;
    });
    let totalInboundCalls = 0;
    Object.keys(agentStatistics).forEach(inboundAgentId => {
        totalInboundCalls += agentStatistics[inboundAgentId].totalCalls || 0;
    });

    // Update agent utilization and longest call duration
    document.querySelector('.outBoundCalls').innerText = totalOutboundCalls;
    document.querySelector('.total-inbound-calls').innerText = totalInboundCalls;
    document.querySelector('.totalAgentsCount').innerText = uniqueOutboundAgents;
    document.querySelector('.longest-inbound-call').innerText = formatDuration(longestCallDuration) || '0';
    document.getElementById("longest-outbound-call").innerText = formatDuration(longestOutboundCallDuration);
    document.getElementById("totalInboundAgents").innerText = uniqueInboundAgents;
    document.getElementById("successfulCalls").innerText = totalOutboundSuccessfulCalls;

    // Example: Set card background color based on outbound calls count
    const outboundCallsCard = document.querySelector('.outBoundCalls').closest('.card');
    if (totalOutboundCalls > 10000) {
        outboundCallsCard.classList.add('card-danger');
        outboundCallsCard.classList.remove('card-success');
    } else {
        outboundCallsCard.classList.add('card-success');
        outboundCallsCard.classList.remove('card-danger');
    }

    processQueueMembership();
}
// get aget queue Membership
async function processQueueMembership() {
    try {
        // Step 1: Fetch the combined queue and queue member data
        const combinedQueues = await connectToPBX("queueList");
        console.log("Combined Queues for all PBXs:", combinedQueues);

        const combinedMembers = await connectToPBX("QueueMemberList");
        console.log("Combined Queue Members for all PBXs:", combinedMembers);

        // Step 2: Create a map for queue ID -> queue name
        const queueMap = {};
        combinedQueues.forEach(queue => {
            queueMap[queue.id] = queue.name;
        });

        // Step 3: Map each agent to their respective queue memberships
        const queueMembership = {};  // Will store agentId -> list of queueIds
        combinedMembers.forEach(member => {

            const { queueId, agentId } = member;
            // if (!queueMembership[agentId]) {
            //     queueMembership[agentId] = [];
            // }
            // queueMembership[agentId].push(queueId);
            // Initialize the queue array for the agent if not already initialized
            if (!queueMembership[agentId]) {
                queueMembership[agentId] = [];
            }

            // Ensure that each agent only gets assigned a queue once, even if multiple PBXs provide the same queueId
            if (!queueMembership[agentId].includes(queueId)) {
                queueMembership[agentId].push(queueId);
            }

        });

        console.log("Queue Memberships:", queueMembership);

        // Step 4: Get the agents (from previous agent list), where the key is username
        const uniqueAgents = await fetchUniqueAgents(); // Assuming this returns the unique agent list with username as key

        // Step 5: Update the HTML table with agent's queue information
        const inboundRows = document.querySelectorAll("#inboundTable tbody tr");
        inboundRows.forEach(row => {
            const username = row.querySelector('td:first-child').innerText;
            console.log("Processing row for username:", username);

            // Find the agentId based on the username from the uniqueAgents map
            const agent = uniqueAgents[username];
            if (agent && queueMembership[agent.agentid]) {
                const queueIds = queueMembership[agent.agentid];
                const queueNames = queueIds.map(queueId => `${queueMap[queueId] || 'Unknown Queue'}`).join(', ');

                // Update the "queues" column with the list of queues
                row.querySelector(".queues").innerHTML = `<a href="#" class="show-queues" data-agent-id="${agent.agentid}" data-agent-name="${username}" data-queues="${queueNames}">show</a>`;
            } else {
                // If no queues are found for the agent, set "No Queues"
                row.querySelector(".queues").textContent = "No Queues";
            }
        });

    } catch (error) {
        console.error("Error processing queue memberships:", error);
    }
}
// Fetching unique agents using username as the key
async function fetchUniqueAgents() {
    try {
        const response = await fetch('http://172.27.177.201:50620/agents');
        if (!response.ok) {
            throw new Error(`HTTP error fetching agents: ${response.status}`);
        }

        const agentsData = await response.json();
        console.log("Fetched agents data structure:", agentsData);

        const uniqueAgentsMap = {};  // Map to store unique agents by username
        const seenUsernames = new Set();

        for (const pbx in agentsData) {
            const pbxAgents = agentsData[pbx];

            // Check if the data for this PBX is an array
            if (Array.isArray(pbxAgents)) {
                console.log(`Processing ${pbx} - Total Agents: ${pbxAgents.length}`);

                pbxAgents.forEach(agent => {
                    const { agentid, username, firstname, lastname, agent_number } = agent;

                    // Process only if the agent has a valid username, a valid agentid, agent_number is not null, and hasn't been processed before
                    if (username && username !== "None" && username !== "0" && username !== "" && username !== null && agentid !== "None" && agentid !== null && agent_number !== null && !seenUsernames.has(username)) {
                        seenUsernames.add(username);  // Mark this username as processed
                        uniqueAgentsMap[username] = {
                            fullName: `${firstname} ${lastname}`,
                            username: username,
                            agentid: agentid,
                            agent_number: agent_number
                        };
                        // console.log(`Added agent: ${username} (Agent ID: ${agentid}, Number: ${agent_number}) from ${pbx}`);
                    } else {
                        if (seenUsernames.has(username)) {
                            // console.log(`Skipped duplicate username: ${username} already processed from ${pbx}`);
                        } else {
                            // console.log(`Skipped invalid agent - Agent ID: ${agentid}, Username: ${username}, Number: ${agent_number} from ${pbx}`);
                        }
                    }
                });
            } else {
                console.warn(`Unexpected format for ${pbx}: Expected array, got ${typeof pbxAgents}`);
            }
        }

        console.log("Final unique agents map: and the count", uniqueAgentsMap, Object.keys(uniqueAgentsMap).length);
        return uniqueAgentsMap;

    } catch (error) {
        console.error("Error fetching agents:", error);
        return {};
    }
}
// Search agents by username only
function searchTable() {
    // Get the active table and the corresponding search input
    const activeTable = document.querySelector('.tab-pane.active').querySelector('table');
    const isOutboundTable = activeTable.id === "outboundTable";
    const nameInput = isOutboundTable ? document.getElementById('outboundSearchInput').value.toLowerCase() : document.getElementById('inboundSearchInput').value.toLowerCase();

    const tbody = activeTable.getElementsByTagName('tbody')[0];
    const tr = tbody.getElementsByTagName('tr');
    let noMatch = true;
    // Loop through all rows in the active table's body, hiding those that don't match the search
    for (let i = 0; i < tr.length; i++) {
        // Determine the correct column index based on the table type
        const tdName = isOutboundTable ? tr[i].getElementsByTagName('td')[0] : tr[i].getElementsByTagName('td')[0];

        if (tdName) {
            const nameValue = tdName.textContent || tdName.innerText;
            if (nameValue.toLowerCase().includes(nameInput)) {
                tr[i].style.display = "";
                noMatch = false;
            } else {
                tr[i].style.display = "none";
            }
        }
    }

    // Handle the "No matches so far" message within the active table
    let noMatchRow = document.getElementById('noMatchRow');
    if (noMatch) {
        // Create and display the "No matches" message if none are found
        if (!noMatchRow) {
            const row = tbody.insertRow();
            row.id = 'noMatchRow';
            const cell = row.insertCell(0);
            cell.colSpan = activeTable.rows[0].cells.length; // Span across all columns
            cell.style.textAlign = 'center';
            cell.innerHTML = 'No matches so far';
        }
    } else if (noMatchRow) {
        // Remove the "No matches" message if matches are found
        noMatchRow.parentNode.removeChild(noMatchRow);
    }
}
/* Agents Page - agents.html */




// Process agents data and fill table in agents.html
async function fetchAllAgentStatistics(totalAgentsCount) {
    try {
        const callLogs = await fetchData('call_logs');
        let agentStatistics = {};
        let outboundStatistics = {};
        let longestCallDuration = 0;
        let longestOutboundCallDuration = 0;
        let agentWithLongestCall = '';
        let uniqueAgents = new Set();
        let outboundUniqueAgents = new Set();
        const today = new Date();
        const sevenAM = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 7, 0, 0, 0);

        const allAgents = await fetchAgents();
        console.log("Requested AgentList", allAgents);
        // Use a for...of to await asynchronous operations
        for (const log of callLogs) {
            const logDate = new Date(log.date);
            // process logs from 7 AM
            if (logDate >= 0) {
                const pbxName = log.pbx_name;
                // Check inbound call using destination_line_identity
                const inboundAgentId = await extractAgent(log.destination_line_identity);
                // Retrieve the agent username from the map based on pbx and agentId
                const inboundAgentUsername = await getAgentUsernameByPbx(inboundAgentId, pbxName, allAgents);
                if (inboundAgentUsername) {
                    uniqueAgents.add(inboundAgentUsername);
                    // Initialize the agent entry if not already present
                    if (!agentStatistics[inboundAgentUsername]) {
                        agentStatistics[inboundAgentUsername] = {
                            totalCalls: 0,
                            answeredCalls: 0,
                            unansweredCalls: 0,
                            totalTalkTime: 0,
                            lastCallTime: null,
                            averageHandleTime: 0,
                            totalHandleTime: 0,
                            utilization: 0,
                            inboundTimeLogs: []
                        };
                    }
                    // Update inbound call statistics
                    agentStatistics[inboundAgentUsername].totalCalls += 1;
                    if (log.answered) {
                        agentStatistics[inboundAgentUsername].answeredCalls += 1;
                    } else {
                        agentStatistics[inboundAgentUsername].unansweredCalls += 1;
                    }
                    // Convert the duration to seconds and add to totalTalkTime
                    const totalSeconds = log.duration;
                    agentStatistics[inboundAgentUsername].totalTalkTime += totalSeconds;
                    // Calculate handle time for this call
                    const handleTime = totalSeconds + 30;
                    agentStatistics[inboundAgentUsername].totalHandleTime += handleTime;
                    // Update longest call if this call is longer
                    if (totalSeconds > longestCallDuration) {
                        longestCallDuration = totalSeconds;
                    }
                    // Add the call start time to the timeLogs
                    agentStatistics[inboundAgentUsername].inboundTimeLogs.push(log.date);
                    if (!agentStatistics[inboundAgentUsername].lastCallTime || logDate > new Date(agentStatistics[inboundAgentUsername].lastCallTime)) {
                        agentStatistics[inboundAgentUsername].lastCallTime = log.date;
                    }
                }

                // Check outbound call using source_line_identity
                const outboundAgentUsername = await extractAgent(log.source_line_identity);
                if (outboundAgentUsername) {
                    outboundUniqueAgents.add(outboundAgentUsername);
                    // Initialize the agent entry in outbound statistics if not already present
                    if (!outboundStatistics[outboundAgentUsername]) {
                        outboundStatistics[outboundAgentUsername] = {
                            totalOutboundCalls: 0,
                            totalOutboundTalkTime: 0,
                            lastOutboundCallTime: null,
                            averageOutboundHandleTime: 0,
                            totalOutboundHandleTime: 0,
                            outboundUtilization: '0%',
                            outboundTimeLogs: [],
                            successfullCalls: 0,
                        };
                    }

                    if (log.answered) {
                        outboundStatistics[outboundAgentUsername].successfullCalls += 1;
                    }
                    // Increment outbound calls and total talk time
                    outboundStatistics[outboundAgentUsername].totalOutboundCalls += 1;
                    const outboundDuration = log.duration;
                    outboundStatistics[outboundAgentUsername].totalOutboundTalkTime += outboundDuration;
                    if (outboundDuration > longestOutboundCallDuration) {
                        longestOutboundCallDuration = outboundDuration;
                        agentWithLongestCall = outboundAgentUsername;
                    }
                    // Calculate handle time for this outbound call
                    let outboundHandleTime = outboundDuration + 30;
                    outboundStatistics[outboundAgentUsername].totalOutboundHandleTime += outboundHandleTime;
                    // most recent outbound
                    if (!outboundStatistics[outboundAgentUsername].lastOutboundCallTime || logDate > new Date(outboundStatistics[outboundAgentUsername].lastOutboundCallTime)) {
                        outboundStatistics[outboundAgentUsername].lastOutboundCallTime = log.date;
                    }
                    // Add the call start time to the outbound timeLogs
                    outboundStatistics[outboundAgentUsername].outboundTimeLogs.push(log.date);
                }
            }
        }

        const workedSeconds = (today - sevenAM) / 1000;
        // Calculate inbound average handle time and efficiency for inbound agents
        for (const username in agentStatistics) {
            const stats = agentStatistics[username];
            if (stats.totalCalls > 0) {
                const utilization = (stats.totalTalkTime / workedSeconds) * 100;
                stats.utilization = utilization.toFixed(2);
            }
        }
        // Calculate average handle time and efficiency for outbound agents
        for (const outboundAgentUsername in outboundStatistics) {
            const stats = outboundStatistics[outboundAgentUsername];
            if (stats.totalOutboundCalls > 0) {
                const outboundUtilization = (stats.totalOutboundTalkTime / workedSeconds) * 100;
                stats.outboundUtilization = outboundUtilization.toFixed(2) + '%';
            }
        }

        // Prepare the final output
        const uniqueInboundAgents = uniqueAgents.size;
        const uniqueOutboundAgents = outboundUniqueAgents.size;
        const uniqueAgentCount = uniqueInboundAgents + uniqueOutboundAgents;
        const agentUtilization = (uniqueAgentCount / totalAgentsCount) * 100;
        return {
            uniqueInboundAgents,
            uniqueOutboundAgents,
            agentStatistics,
            agentWithLongestCall,
            outboundStatistics,
            longestCallDuration,
            longestOutboundCallDuration,
            agentUtilization: agentUtilization.toFixed(2) + '%',
        };

    } catch (error) {
        console.error("Error in fetchAllAgentStatistics:", error);
        throw error;
    }
}
// Find user id based on PBX
async function getAgentUsernameByPbx(agentId, pbxName, allAgents) {
    // Check if the pbxName exists in the allAgents object
    if (allAgents[pbxName]) {
        // Loop through the agents in the pbx
        for (const agent of allAgents[pbxName]) {
            // Match the agentId to the agent's agentid
            if (agent.agentid === agentId) {
                return agent.username;
            }
        }
    }
    return;
}
// Modify extractAgent to use the pre-fetched userAgentMap
function extractAgent(identity) {
    if (typeof identity === "string") {
        const unwantedIdentities = ['sip/254709273000', 'sip/0730673000'];
        // Check if the identity is in the unwantedIdentities array
        if (unwantedIdentities.includes(identity)) {
            return null;
        }
        // For inbound calls, extract the agent ID from the local/id- format
        if (identity.startsWith("local/id-")) {
            const agentId = identity.split("@")[0].split("-")[1];
            // console.log("Extracted agent ID from local/id- format:", agentId);
            return agentId;
        } else if (identity.startsWith("sip/")) {
            const username = identity.split("/")[1];
            // console.log("Extracted username from sip/ format:", username);
            return username;
        }
    }

    return null;
}
// Fetch data from Fleet server, specifying either "call_logs" or "queue_logs"
async function fetchData(logType = 'call_logs') {
    return fetch('http://172.27.177.201:50620/data')
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP error! Status: ' + response.status);
            }
            return response.json();
        })
        .then(function (data) {
            // Return the specified log type
            return data[logType] || [];
        })
        .catch(function (error) {
            console.error("Error fetching data: ", error);
            return [];
        });
}
// get Agents from API
async function fetchAgents() {
    try {
        // Fetch data from the /agents endpoint
        const response = await fetch('http://172.27.177.201:50620/agents');
        if (!response.ok) {
            throw new Error(`HTTP error fetching agents: ${response.status}`);
        }
        const agents = await response.json();
        return agents;  // Returns an object with PBX names as keys (pbx1, pbx2, etc.)
    } catch (error) {
        console.error("Error fetching agents:", error);
        return {};
    }
}
// Get user data from api to match agent ID
async function fetchDataFromPbx() {
    return fetch('https://172.27.189.172:9486/1.1/users', {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'X-Auth-Token': '2a916369-472d-4563-81d7-4c547e7694e9'
        }
    })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP error! Status: ' + response.status);
            }
            return response.json();
        })
        .catch(function (error) {
            console.error("Error fetching data: ", error);
            return { items: [] };
        });
}
// Line graph plotting
function plotLineGraph(hourlyCallData, selectedQueue, timeFrames, graphId) {
    const queueData = timeFrames.map(frame => hourlyCallData[frame][selectedQueue] || 0);
    // Prepare line graph data
    const lineData = [{
        x: timeFrames,
        y: queueData,
        mode: 'lines+markers',
        type: "scatter",
        name: `Queue ${selectedQueue}`
    }];

    // Updated layout to include the queue name in the title
    const lineLayout = {
        title: `Calls from today 7AM for ${selectedQueue}`,
        xaxis: { title: "Time (hours)", tickvals: timeFrames },
        yaxis: { title: "Number of Calls" }
    };

    // Plot the graph in the specified HTML element
    Plotly.newPlot(graphId, lineData, lineLayout);
}
// Create time frames for graph
function createTimeFrames(interval) {
    const now = new Date();
    const timeFrames = [];
    for (let i = interval; i <= 24; i += interval) {
        let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), i - interval);
        let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), i);
        timeFrames.push({
            start: start,
            end: end,
            label: `${i}`
        });
    }
    return timeFrames;
}
// Function to inititalize graph data
function initializeHourlyCallData(timeFrames) {
    const hourlyCallData = {};
    timeFrames.forEach(frame => {
        hourlyCallData[frame.label] = {};  // Initialize each label with an empty object
    });
    return hourlyCallData;
}
// Format duration to HH:MM:SS
function formatDuration(duration) {
    // Ensure the input is a number and non-negative
    if (typeof duration !== 'number' || duration <= 0) {
        // throw new Error('Duration must be a non-negative number');
        return;
    }
    const hours = String(Math.floor(duration / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((duration % 3600) / 60)).padStart(2, '0');
    const seconds = String(Math.floor(duration % 60)).padStart(2, '0'); // Floor seconds to remove decimals
    return `${hours}:${minutes}:${seconds}`;
}
// Function to convert duration in HH:MM:SS to seconds
function durationToSeconds(duration) {
    if (duration) {
        let parts = duration.split(':').map(Number);
        let converted = parts[0] * 3600 + parts[1] * 60 + parts[2];
        return converted;
    } else {
        console.log("no timestamp passed");
        return;
    }
}

