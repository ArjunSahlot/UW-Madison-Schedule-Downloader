import {
  Anchor,
  AppShell,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
  Title
} from "@mantine/core";
import {
  IconArrowUpRight,
  IconDownload,
  IconReload
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import browser from "webextension-polyfill";

import {
  DOWNLOAD_SHED_MSG,
  GET_TERM_MSG,
  SCHEDULE_SITE_HOST,
  SCHEDULE_SITE_PATH
} from "~assets/constants";
import useCurrentTabUrl from "~hooks/useCurrentTabUrl";
import isScheduleSite from "~util/isScheduleSite";

import Header from "./Header";
import { ThemeProvider } from "./theme";

const Popup = () => {
  const currUrl = useCurrentTabUrl();
  const isShedSite = currUrl && isScheduleSite(currUrl);

  const [detectedSemester, setDetectedSemester] = useState("None");
  const [breaks, setBreaks] = useState([]);
  const [loadingSemester, setLoadingSemester] = useState(true);
  const [loadingBreaks, setLoadingBreaks] = useState(false);

  const downloadSchedule = useCallback(async () => {
    console.log("🚀 Starting download schedule...");
    console.log("📦 Raw breaks data:", breaks);
    
    // Convert dates to ISO strings for safe message passing
    const serializedBreaks = breaks.map(breakItem => {
      const serialized = {
        ...breakItem,
        date: breakItem.date ? breakItem.date.toISOString() : null
      };
      console.log("🔄 Serialized break:", serialized);
      return serialized;
    });
    
    console.log("📨 Sending message with payload:", serializedBreaks);

    try {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true
      });

      if (activeTab.id) {
        console.log("📮 Sending message to tab:", activeTab.id);
        const response = await browser.tabs.sendMessage(activeTab.id, {
          type: DOWNLOAD_SHED_MSG,
          payload: serializedBreaks
        });
        console.log("✅ Message sent successfully, response:", response);
      } else {
        console.error("❌ No active tab ID found");
      }
    } catch (error) {
      console.error("❌ Error in downloadSchedule:", error);
      console.error("❌ Error details:", error.message, error.stack);
    }
  }, [breaks]);

  const openSite = useCallback(() => {
    window.open("https://" + SCHEDULE_SITE_HOST + SCHEDULE_SITE_PATH, "_blank");
  }, []);

  const getTerm = useCallback(async () => {
    try {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true
      });

      if (activeTab.id) {
        const response: { detectedSemester: string } =
          await browser.tabs.sendMessage(activeTab.id, {
            type: GET_TERM_MSG
          });

        if (response && response.detectedSemester) {
          setDetectedSemester(response.detectedSemester);
        }
      }
    } catch (error) {
      console.error("Error getting term: ", error);
    } finally {
      setLoadingSemester(false);
    }
  }, []);

  useEffect(() => {
    if (isShedSite) {
      setLoadingSemester(true);
      getTerm();
    }
  }, [isShedSite, getTerm]);

  const updateBreaks = useCallback(() => {
    setLoadingBreaks(true);

    fetch("https://secfac.wisc.edu/academic-calendar/")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.text();
      })
      .then((html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        let rows = doc.querySelector("table").querySelector("tbody").children;

        let [semType, semYear] = detectedSemester.split(" ");
        let semesterTitle = semType;
        semType = semType.toLowerCase();

        let startingIndex = 0;

        for (let i = 0; i < rows.length; i++) {
          let strong = rows[i].querySelector("strong");
          if (strong && strong.textContent.toLowerCase().includes(semType)) {
            startingIndex = i;
            break;
          }
        }

        let parseDate = (dateStr) => {
          console.log("🔍 PARSING DATE:", dateStr);
          
          let dateParts = dateStr.match(/[a-z]{3,4} \d{1,2}/gi);
          let hyphenNum = dateStr.match(/- ?\d{1,2}/gi);

          console.log("📅 Date parts:", dateParts);
          console.log("🔢 Hyphen numbers:", hyphenNum);
          console.log("📆 Semester year:", semYear);

          let res = {
            date: null,
            length: 1
          };

          if (!dateParts || dateParts.length === 0) {
            console.error("❌ No date parts found for:", dateStr);
            return res;
          }

          try {
            let dateString = dateParts[0] + ", " + semYear;
            console.log("🗓️ Constructing date from:", dateString);
            res.date = new Date(dateString);
            
            if (isNaN(res.date.getTime())) {
              console.error("❌ Invalid date created:", dateString);
              res.date = null;
              return res;
            }
            
            console.log("✅ Initial date created:", res.date);
            
            if (dateParts.length === 2) {
              let dateString1 = dateParts[0] + ", " + semYear;
              let dateString2 = dateParts[1] + ", " + semYear;
              console.log("🗓️ Two dates - String 1:", dateString1, "String 2:", dateString2);
              
              let date1 = new Date(dateString1);
              let date2 = new Date(dateString2);
              
              if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
                console.error("❌ Invalid dates in range:", date1, date2);
                return res;
              }
              
              let difference = date2.getTime() - date1.getTime();
              res.length = difference / (1000 * 3600 * 24) + 1;
              console.log("📏 Length calculated:", res.length);
            } else if (hyphenNum && hyphenNum.length > 0) {
              let dateString1 = dateParts[0] + ", " + semYear;
              let num2 = parseInt(hyphenNum[0].replace("-", "").trim());
              let month = dateParts[0].split(" ")[0];
              let dateString2 = `${month} ${num2}, ${semYear}`;
              
              console.log("🗓️ Hyphen range - String 1:", dateString1, "String 2:", dateString2);
              
              let date1 = new Date(dateString1);
              let date2 = new Date(dateString2);
              
              if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
                console.error("❌ Invalid dates in hyphen range:", date1, date2);
                return res;
              }
              
              let difference = date2.getTime() - date1.getTime();
              res.length = difference / (1000 * 3600 * 24) + 1;
              console.log("📏 Hyphen length calculated:", res.length);
            }
          } catch (error) {
            console.error("❌ Error in parseDate:", error);
            res.date = null;
          }

          console.log("📋 Final result:", res);
          return res;
        };

        let breaksData = [];

        breaksData.push({
          name: `${semesterTitle} start`,
          ...parseDate(rows[startingIndex].children[1].textContent)
        });

        for (let i = startingIndex + 1; i < rows.length; i++) {
          let leftTitle = rows[i].children[0].textContent.toLowerCase();
          let parsedDate = parseDate(rows[i].children[1].textContent);

          if (leftTitle.includes("last")) {
            breaksData.push({
              name: `${semesterTitle} end`,
              ...parsedDate
            });
            break;
          }

          if (
            leftTitle.includes("break") ||
            leftTitle.includes("day") ||
            leftTitle.includes("recess")
          ) {
            let breakData = {
              name: rows[i].children[0].textContent,
              ...parsedDate
            };
            breaksData.push(breakData);
          }
        }

        setBreaks(breaksData);
        setLoadingBreaks(false);
      })
      .catch((error) => {
        console.error("Error fetching breaks: ", error);
        setBreaks([]);
        setLoadingBreaks(false);
      });
  }, [detectedSemester, setBreaks, setLoadingBreaks]);

  return (
    <ThemeProvider withNormalizeCSS withGlobalStyles>
      <AppShell header={<Header />} w={350}>
        <Stack>
          {isShedSite && (
            <>
              <Group position="apart">
                <Text weight={600}>Detected semester:</Text>
                {loadingSemester ? (
                  <Loader size="xs" />
                ) : (
                  <Text>{detectedSemester}</Text>
                )}
              </Group>
              <Divider my="sm" />
              <Button
                variant={breaks.length > 0 ? "outline" : "filled"}
                color="blue"
                leftIcon={<IconReload />}
                onClick={updateBreaks}>
                Update Breaks
              </Button>
              <Title order={4}>Breaks</Title>
              {loadingBreaks ? (
                <Loader size="xs" />
              ) : breaks.length > 0 ? (
                breaks.map((breakItem, index) => {
                  const startDate = new Date(breakItem.date);
                  const endDate = new Date(startDate);
                  endDate.setDate(startDate.getDate() + breakItem.length - 1);

                  let dateStr =
                    breakItem.length > 1
                      ? `${startDate.toDateString()} - ${endDate.toDateString()}`
                      : startDate.toDateString();

                  return (
                    <Card key={index} shadow="sm" padding="sm" withBorder>
                      <Text weight={500}>{breakItem.name}</Text>
                      <Badge color="blue">{dateStr}</Badge>
                    </Card>
                  );
                })
              ) : (
                <Text>No breaks available</Text>
              )}
              <Divider my="sm" />
            </>
          )}
          {isShedSite ? (
            <Button leftIcon={<IconDownload />} onClick={downloadSchedule}>
              {breaks.length > 0
                ? "Download Schedule with Breaks"
                : "Download Schedule"}
            </Button>
          ) : (
            <Button leftIcon={<IconArrowUpRight />} onClick={openSite}>
              Go to Schedule Site
            </Button>
          )}
        </Stack>

        <Text c="dimmed" align="center" mt="lg">
          Made by{" "}
          <Anchor color="dimmed" href="https://mmaeder.com/" target="_blank">
            Max Maeder
          </Anchor>
        </Text>
      </AppShell>
    </ThemeProvider>
  );
};

export default Popup;
